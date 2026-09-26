"use client";

import { clsx } from "clsx";
import { useState, type ComponentProps, type ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import styles from "./skills.module.scss";

/**
 * Renders skill tooltip controls with compact and labeled responsive states.
 *
 * @param skills - Skill names with their server-rendered icons.
 * @param props - List attributes and layout classes.
 * @returns The skill list with one icon instance and ordinary keyboard tab order.
 */
export function SkillList({ skills, ...props }: ComponentProps<"ul"> & {
  skills: readonly { name: string; icon: ReactNode }[];
}) {
  const [openSkill, setOpenSkill] = useState<number | null>(null);

  return (
    <TooltipProvider delay={250}>
      <ul {...props}>
        {skills.map((skill, index) => (
          <li className="inline-flex" data-slot="skill" key={skill.name}>
            <Tooltip open={openSkill === index} onOpenChange={(open) => { setOpenSkill((current) => open ? index : current === index ? null : current); }}>
              <TooltipTrigger
                type="button"
                className={clsx(
                  styles.skill,
                  "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-sm text-sm leading-6 text-content-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 lg:min-h-0 lg:min-w-0 lg:gap-2.5",
                )}
                data-slot="skill-trigger"
                closeOnClick={false}
                onClick={() => { setOpenSkill(index); }}
              >
                {skill.icon && (
                  <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center" data-slot="skill-icon">
                    {skill.icon}
                  </span>
                )}
                <span className={clsx(skill.icon && "max-lg:sr-only")} data-slot="skill-label">{skill.name}</span>
              </TooltipTrigger>
              <TooltipContent className="data-closed:hidden motion-reduce:animate-none">{skill.name}</TooltipContent>
            </Tooltip>
          </li>
        ))}
      </ul>
    </TooltipProvider>
  );
}
