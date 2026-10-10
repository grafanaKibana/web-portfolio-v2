/** Local image sources used by the static hero compositor. */
export type HeroBackgroundSources = {
  light: string;
  dark: string;
  noise: string;
};

/** GPU resources retained between occasional static redraws. */
export type HeroBackgroundResources = {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer;
};
