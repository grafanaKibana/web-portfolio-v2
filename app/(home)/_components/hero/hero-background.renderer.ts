import { createHeroDither, resolveHeroCover, resolveHeroRaster } from "./hero-background.helpers";
import type { HeroBackgroundResources, HeroBackgroundSources } from "./hero-background.models";
import { heroFragmentShader, heroVertexShader } from "./hero-background.shader";

/** Draws the approved static layers in float before rounding once at physical output pixels. */
export class HeroBackgroundRenderer {
  private context: WebGLRenderingContext | null = null;
  private resources: HeroBackgroundResources | null = null;
  private theme = "";
  private generation = 0;
  private disposed = false;
  private frame = 0;
  private resizeObserver: ResizeObserver | null = null;
  private themeObserver: MutationObserver | null = null;
  private field: { source: string; image: Promise<HTMLImageElement> } | null = null;
  private grain: Promise<HTMLImageElement> | null = null;

  /**
   * Retains the route-owned canvas and its local images.
   * @param canvas - Opaque output surface above the CSS fallback.
   * @param sources - Approved light, dark, and grain assets.
   */
  constructor(private readonly canvas: HTMLCanvasElement, private readonly sources: HeroBackgroundSources) {}

  /** Starts the first draw and observes only changes requiring a new static frame. */
  start() {
    this.canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    window.addEventListener("resize", this.onResize);
    this.themeObserver = new MutationObserver(() => {
      if (this.currentTheme() === this.theme) return;
      this.setState("pending");
      void this.draw();
    });
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(this.canvas);
    void this.draw();
  }

  /** Releases observers, pending work, decoded references, and the route-owned GPU context. */
  dispose() {
    this.disposed = true;
    this.generation += 1;
    window.cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    this.themeObserver?.disconnect();
    window.removeEventListener("resize", this.onResize);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.releaseResources();
    this.context?.getExtension("WEBGL_lose_context")?.loseContext();
    this.context = null;
    this.field = null;
    this.grain = null;
  }

  /** Coalesces size and device-density changes into one static redraw. */
  private readonly onResize = () => {
    window.cancelAnimationFrame(this.frame);
    this.frame = window.requestAnimationFrame(() => { void this.draw(); });
  };

  /**
   * Exposes the CSS fallback immediately while allowing browser context recovery.
   * @param event - Browser notification that the drawing buffer is unavailable.
   */
  private readonly onContextLost = (event: Event) => {
    event.preventDefault();
    this.generation += 1;
    this.resources = null;
    this.setState("fallback");
  };

  /** Recreates GPU resources and replaces the fallback only after a complete restored draw. */
  private readonly onContextRestored = () => { void this.draw(); };

  /** @returns The theme already resolved by the shared document theme provider. */
  private currentTheme() {
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  }

  /**
   * Atomically controls fallback visibility and publishes terminal splash readiness.
   * @param state - Pending, fully drawn, or fallback rendering state.
   */
  private setState(state: "pending" | "ready" | "fallback") {
    if (this.disposed) return;
    this.canvas.dataset.openingRenderer = state;
    if (state !== "pending") this.canvas.dispatchEvent(new Event("opening-renderer-settled"));
  }

  /**
   * Decodes an image using the cache already warmed by the parse-time preload.
   * @param source - Local image URL.
   * @returns Its decoded image for texture upload.
   */
  private async decode(source: string) {
    const image = new Image();
    image.decoding = "async";
    image.src = source;
    await image.decode();
    return image;
  }

  /**
   * Compiles one shader and releases it if compilation fails.
   * @param gl - Route-owned context.
   * @param type - Vertex or fragment stage.
   * @param source - Local shader source.
   * @returns The compiled stage.
   * @throws When allocation or compilation fails.
   */
  private compile(gl: WebGLRenderingContext, type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Hero shader unavailable");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw new Error("Hero shader compilation failed");
    }
    return shader;
  }

  /**
   * Allocates the static program and quad, without retaining uploaded image textures.
   * @returns Supported GPU resources.
   * @throws When WebGL, high precision, allocation, or linking is unavailable.
   */
  private initialize(): HeroBackgroundResources {
    const gl = this.canvas.getContext("webgl", {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: true,
    });
    this.context = gl;
    if (!gl || !gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision) {
      throw new Error("Hero high precision rendering unavailable");
    }
    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    const shaders: WebGLShader[] = [];
    try {
      shaders.push(this.compile(gl, gl.VERTEX_SHADER, heroVertexShader));
      shaders.push(this.compile(gl, gl.FRAGMENT_SHADER, heroFragmentShader));
      shaders.forEach((shader) => { gl.attachShader(program, shader); });
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Hero shader linking failed");
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.DITHER);
      return { gl, program, buffer };
    } catch (error) {
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
      throw error;
    } finally {
      shaders.forEach((shader) => { gl.deleteShader(shader); });
    }
  }

  /** Releases retained static resources on route disposal or a failed draw. */
  private releaseResources() {
    if (!this.resources) return;
    const { gl, program, buffer } = this.resources;
    gl.deleteProgram(program);
    gl.deleteBuffer(buffer);
    this.resources = null;
  }

  /**
   * Converts the inherited CSS surface token to the same sRGB bytes used by browser paint.
   * @param value - Computed CSS color, including modern color syntax.
   * @returns Normalized RGB components.
   * @throws When the browser cannot allocate a color conversion surface.
   */
  private color(value: string): Float32Array {
    const sample = document.createElement("canvas");
    sample.width = sample.height = 1;
    const context = sample.getContext("2d");
    if (!context) throw new Error("Hero color conversion unavailable");
    context.fillStyle = value.trim();
    context.fillRect(0, 0, 1, 1);
    return new Float32Array(Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map((channel) => channel / 255));
  }

  /** Draws one current-theme frame and settles to CSS on any rendering or image failure. */
  private async draw() {
    if (this.disposed) return;
    const generation = ++this.generation;
    this.theme = this.currentTheme();
    const source = this.theme === "dark" ? this.sources.dark : this.sources.light;
    try {
      this.resources ??= this.initialize();
      if (this.field?.source !== source) this.field = { source, image: this.decode(source) };
      this.grain ??= this.decode(this.sources.noise);
      const [field, grain] = await Promise.all([this.field.image, this.grain]);
      if (generation !== this.generation) return;
      const { gl, program } = this.resources;
      const rect = this.canvas.getBoundingClientRect();
      const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
      const raster = resolveHeroRaster(rect.width, rect.height, window.devicePixelRatio,
        Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)), [Number(viewport[0]), Number(viewport[1])]);
      if (!raster || Math.max(field.width, field.height, grain.width, grain.height) > Number(gl.getParameter(gl.MAX_TEXTURE_SIZE))) {
        throw new Error("Hero native framebuffer exceeds device limits");
      }
      this.canvas.width = raster.width;
      this.canvas.height = raster.height;
      gl.viewport(0, 0, raster.width, raster.height);
      gl.useProgram(program);
      const textures: WebGLTexture[] = [];
      try {
        ([[field, "u_field"], [grain, "u_grain"], [createHeroDither(), "u_dither"]] as const).forEach(([image, sampler], index) => {
          const texture = gl.createTexture();
          textures.push(texture);
          gl.activeTexture(gl.TEXTURE0 + index);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, index === 0 ? gl.LINEAR : gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, index === 0 ? gl.LINEAR : gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, index === 0 ? gl.CLAMP_TO_EDGE : gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, index === 0 ? gl.CLAMP_TO_EDGE : gl.REPEAT);
          if (image instanceof Uint8Array) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 256, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, image);
          } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          }
          gl.uniform1i(gl.getUniformLocation(program, sampler), index);
        });
        const style = getComputedStyle(this.canvas);
        gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), raster.width, raster.height);
        gl.uniform2fv(gl.getUniformLocation(program, "u_crop"), new Float32Array(resolveHeroCover(rect.width, rect.height, field.width, field.height)));
        gl.uniform1f(gl.getUniformLocation(program, "u_pixelRatio"), raster.pixelRatio);
        gl.uniform3fv(gl.getUniformLocation(program, "u_pageColor"), this.color(style.getPropertyValue("--background")));
        gl.uniform3fv(gl.getUniformLocation(program, "u_veilColor"), this.color(style.getPropertyValue("--hero-surface")));
        gl.uniform1f(gl.getUniformLocation(program, "u_veil"), Number(style.getPropertyValue("--hero-veil")));
        gl.uniform1f(gl.getUniformLocation(program, "u_grainOpacity"), Number(style.getPropertyValue("--hero-noise-opacity")));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.finish();
        if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw new Error("Hero draw failed");
        this.setState("ready");
      } finally {
        textures.forEach((texture) => { gl.deleteTexture(texture); });
      }
    } catch {
      if (generation !== this.generation) return;
      this.setState("fallback");
      this.releaseResources();
    }
  }
}
