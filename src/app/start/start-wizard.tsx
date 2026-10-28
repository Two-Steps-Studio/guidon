"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  Gamepad2,
  Globe,
  Smartphone,
  Users,
  User,
  Building2,
  Wrench,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ONBOARDING_PROJECT_TYPES,
  ONBOARDING_TEAM_SIZES,
  defaultTemplateFor,
  readStoredOnboarding,
  storeOnboarding,
  type OnboardingAnswers,
  type OnboardingTeamSize,
} from "@/lib/onboarding";
import { PROJECT_TEMPLATES, type ProjectTemplate } from "@/lib/work/project-modules";
import type { ProjectMethodology, ProjectType } from "@/types/project";

const TYPE_ICONS: Record<ProjectType, LucideIcon> = {
  game: Gamepad2,
  website: Globe,
  mobile_app: Smartphone,
  api: Webhook,
  tool: Wrench,
  other: Boxes,
};

const TEAM_ICONS: Record<OnboardingTeamSize, LucideIcon> = { solo: User, small: Users, studio: Building2 };

const TEMPLATES = Object.keys(PROJECT_TEMPLATES) as ProjectTemplate[];
// Only the name is needed; type, workflow and team can be skipped with
// sensible defaults and changed later in the project's settings.
const STEPS = ["name", "type", "workflow", "team", "account"] as const;

/**
 * /start: what it's called, then (each skippable) what you're making, how you
 * work and who's on it - then the account, last. Every answer is kept in this browser as it's
 * given, so signing up (or an OAuth round trip) doesn't lose anything, and
 * coming back later resumes where you were.
 */
export function StartWizard({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("onboarding");
  const tCommon = useTranslations("common");
  const tSettings = useTranslations("settings");
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [projectType, setProjectType] = useState<ProjectType | null>(null);
  const [projectName, setProjectName] = useState("");
  const [studioName, setStudioName] = useState("");
  const [template, setTemplate] = useState<ProjectTemplate | null>(null);
  const [methodology, setMethodology] = useState<ProjectMethodology>("standard");
  const [teamSize, setTeamSize] = useState<OnboardingTeamSize | null>(null);

  // Resume an earlier visit.
  useEffect(() => {
    const saved = readStoredOnboarding();
    if (!saved) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from localStorage, which the server render can't see
    setProjectType(saved.projectType);
    setProjectName(saved.projectName);
    setStudioName(saved.studioName);
    setTemplate(saved.template);
    setMethodology(saved.methodology);
    setTeamSize(saved.teamSize);
    // Everything was answered (e.g. back here after confirming the email):
    // straight to the last step.
    setStep(STEPS.length - 1);
  }, []);

  const answers: OnboardingAnswers | null =
    projectType && projectName.trim() && template && teamSize
      ? { projectType, projectName: projectName.trim(), studioName: studioName.trim(), template, methodology, teamSize }
      : null;

  const serialized = answers ? JSON.stringify(answers) : null;
  useEffect(() => {
    if (serialized) storeOnboarding(JSON.parse(serialized) as OnboardingAnswers);
  }, [serialized]);

  const canContinue = [Boolean(projectName.trim()), Boolean(projectType), Boolean(template), Boolean(teamSize), true][step];
  const next = () => canContinue && setStep((current) => Math.min(current + 1, STEPS.length - 1));
  const back = () => setStep((current) => Math.max(current - 1, 0));

  const chooseType = (type: ProjectType) => {
    setProjectType(type);
    // The template follows what's being built until it's picked by hand.
    setTemplate((current) => current ?? defaultTemplateFor(type));
    setStep(2);
  };

  // No setup questions forced on anyone: the defaults give a plain board.
  const skipToAccount = () => {
    const type = projectType ?? "other";
    setProjectType(type);
    setTemplate((current) => current ?? defaultTemplateFor(type));
    setTeamSize((current) => current ?? "small");
    setStep(STEPS.length - 1);
  };

  const finishHref = "/start/finish";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10 sm:py-16">
      <div className="space-y-3">
        <div className="flex gap-1.5" aria-hidden>
          {STEPS.map((name, index) => (
            <div
              key={name}
              className={cn("h-1 flex-1 rounded-full transition-colors", index <= step ? "bg-primary" : "bg-muted")}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t("stepOf", { step: step + 1, total: STEPS.length })}</p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          next();
        }}
        className="space-y-6"
      >
        {step === 1 && (
          <section className="space-y-5">
            <Heading title={t("typeTitle")} description={t("typeDescription")} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {ONBOARDING_PROJECT_TYPES.map((type) => {
                const Icon = TYPE_ICONS[type];
                return (
                  <ChoiceCard key={type} selected={projectType === type} onClick={() => chooseType(type)}>
                    <Icon className="h-6 w-6" />
                    <span className="font-medium">{tCommon("projectType", { type })}</span>
                  </ChoiceCard>
                );
              })}
            </div>
          </section>
        )}

        {step === 0 && (
          <section className="space-y-5">
            <Heading title={t("nameTitle")} description={t("nameDescription")} />
            <div className="space-y-2">
              <Label htmlFor="onboarding-project">{t("projectNameLabel")}</Label>
              <Input
                id="onboarding-project"
                autoFocus
                value={projectName}
                maxLength={100}
                placeholder={t("projectNamePlaceholder")}
                onChange={(event) => setProjectName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="onboarding-studio">{t("studioNameLabel")}</Label>
              <Input
                id="onboarding-studio"
                value={studioName}
                maxLength={100}
                placeholder={t("studioNamePlaceholder")}
                onChange={(event) => setStudioName(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("studioNameHint")}</p>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-5">
            <Heading title={t("workflowTitle")} description={t("workflowDescription")} />
            <div className="grid gap-3 sm:grid-cols-2">
              {TEMPLATES.map((value) => (
                <ChoiceCard key={value} selected={template === value} onClick={() => setTemplate(value)} align="start">
                  <span className="font-medium">{tSettings(`labelStarter.${value}.title`)}</span>
                  <span className="text-xs text-muted-foreground">{t(`templateHint.${value}`)}</span>
                </ChoiceCard>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("methodologyLabel")}</p>
              <div className="grid grid-cols-2 gap-3">
                {(["standard", "scrum"] as const).map((value) => (
                  <ChoiceCard key={value} selected={methodology === value} onClick={() => setMethodology(value)} align="start">
                    <span className="font-medium">{tCommon("projectMethodology", { methodology: value })}</span>
                    <span className="text-xs text-muted-foreground">{t(`methodologyHint.${value}`)}</span>
                  </ChoiceCard>
                ))}
              </div>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-5">
            <Heading title={t("teamTitle")} description={t("teamDescription")} />
            <div className="grid gap-3 sm:grid-cols-3">
              {ONBOARDING_TEAM_SIZES.map((size) => {
                const Icon = TEAM_ICONS[size];
                return (
                  <ChoiceCard
                    key={size}
                    selected={teamSize === size}
                    onClick={() => {
                      setTeamSize(size);
                      setStep(4);
                    }}
                  >
                    <Icon className="h-6 w-6" />
                    <span className="font-medium">{t(`team.${size}`)}</span>
                    <span className="text-xs text-muted-foreground">{t(`teamHint.${size}`)}</span>
                  </ChoiceCard>
                );
              })}
            </div>
          </section>
        )}

        {step === 4 && answers && (
          <section className="space-y-5">
            <Heading
              title={signedIn ? t("readyTitleSignedIn") : t("readyTitle")}
              description={signedIn ? t("readyDescriptionSignedIn") : t("readyDescription")}
            />
            <ul className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
              <Summary label={t("summaryProject")} value={`${answers.projectName} · ${tCommon("projectType", { type: answers.projectType })}`} />
              <Summary label={t("summaryStudio")} value={answers.studioName || t("studioDefault", { project: answers.projectName })} />
              <Summary
                label={t("summaryWorkflow")}
                value={`${tSettings(`labelStarter.${answers.template}.title`)} · ${tCommon("projectMethodology", { methodology: answers.methodology })}`}
              />
              <Summary label={t("summaryTeam")} value={t(`team.${answers.teamSize}`)} />
            </ul>
            {signedIn ? (
              <Button type="button" size="lg" className="w-full" onClick={() => router.push(finishHref)}>
                {t("createWorkspace")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <div className="space-y-3">
                <Button asChild size="lg" className="w-full">
                  <Link href={`/auth/signup?redirect=${encodeURIComponent(finishHref)}`}>
                    {t("createAccount")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  {t("haveAccount")}{" "}
                  <Link href={`/auth/login?redirect=${encodeURIComponent(finishHref)}`} className="text-primary underline underline-offset-2">
                    {t("signIn")}
                  </Link>
                </p>
              </div>
            )}
          </section>
        )}

        <div className="flex items-center justify-between gap-3">
          {step > 0 ? (
            <Button type="button" variant="ghost" onClick={back}>
              <ArrowLeft className="h-4 w-4" />
              {t("back")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {step > 0 && step < STEPS.length - 1 && (
              <Button type="button" variant="ghost" onClick={skipToAccount}>
                {t("skipSetup")}
              </Button>
            )}
            {step < STEPS.length - 1 && step !== 1 && step !== 3 && (
              <Button type="submit" disabled={!canContinue}>
                {t("continue")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function Heading({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1.5">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

function ChoiceCard({
  selected,
  onClick,
  children,
  align = "center",
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  align?: "center" | "start";
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "relative flex flex-col gap-1.5 rounded-xl border bg-card p-4 text-sm transition-colors",
        align === "center" ? "items-center text-center" : "items-start text-left",
        "hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary bg-primary/5" : "border-border"
      )}
    >
      {selected && <Check className="absolute right-2.5 top-2.5 h-4 w-4 text-primary" aria-hidden />}
      {children}
    </button>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </li>
  );
}
