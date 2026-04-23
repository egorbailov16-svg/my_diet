"use client";

import { dayTargetRepo, profileRepo } from "@/lib/data";
import { isAdminUnlocked, setAdminUnlocked, validateAdminCredentials } from "@/lib/admin/local-admin";
import type { DayTarget, Profile } from "@/lib/data";
import { useEffect, useMemo, useState } from "react";

type ProfileForm = {
  heightCm: string;
  currentWeightKg: string;
  goalWeightKg: string;
};

type TargetForm = {
  kcalMin: string;
  kcalMax: string;
  proteinTarget: string;
  fatMin: string;
  fatMax: string;
  carbsMin: string;
  carbsMax: string;
};

function nowISO(): string {
  return new Date().toISOString();
}

function parseNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100) / 100;
}

function toInput(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [targets, setTargets] = useState<DayTarget[]>([]);
  const [adminUnlocked, setAdminUnlockedState] = useState(false);
  const [adminLogin, setAdminLogin] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminMessage, setAdminMessage] = useState("");

  const [profileForm, setProfileForm] = useState<ProfileForm>({
    heightCm: "",
    currentWeightKg: "",
    goalWeightKg: "",
  });
  const [normalTargetForm, setNormalTargetForm] = useState<TargetForm>({
    kcalMin: "",
    kcalMax: "",
    proteinTarget: "",
    fatMin: "",
    fatMax: "",
    carbsMin: "",
    carbsMax: "",
  });
  const [strengthTargetForm, setStrengthTargetForm] = useState<TargetForm>({
    kcalMin: "",
    kcalMax: "",
    proteinTarget: "",
    fatMin: "",
    fatMax: "",
    carbsMin: "",
    carbsMax: "",
  });

  useEffect(() => {
    async function loadSettings() {
      const [loadedProfile, loadedTargets] = await Promise.all([profileRepo.get(), dayTargetRepo.list()]);

      if (loadedProfile) {
        setProfile(loadedProfile);
        setProfileForm({
          heightCm: toInput(loadedProfile.heightCm),
          currentWeightKg: toInput(loadedProfile.currentWeightKg),
          goalWeightKg: toInput(loadedProfile.goalWeightKg),
        });
      }
      setAdminUnlockedState(isAdminUnlocked());

      setTargets(loadedTargets);
      const normal = loadedTargets.find((item) => item.dayType === "normal");
      const strength = loadedTargets.find((item) => item.dayType === "strength");

      if (normal) {
        setNormalTargetForm({
          kcalMin: toInput(normal.kcalMin),
          kcalMax: toInput(normal.kcalMax),
          proteinTarget: toInput(normal.proteinTarget),
          fatMin: toInput(normal.fatMin),
          fatMax: toInput(normal.fatMax),
          carbsMin: toInput(normal.carbsMin),
          carbsMax: toInput(normal.carbsMax),
        });
      }

      if (strength) {
        setStrengthTargetForm({
          kcalMin: toInput(strength.kcalMin),
          kcalMax: toInput(strength.kcalMax),
          proteinTarget: toInput(strength.proteinTarget),
          fatMin: toInput(strength.fatMin),
          fatMax: toInput(strength.fatMax),
          carbsMin: toInput(strength.carbsMin),
          carbsMax: toInput(strength.carbsMax),
        });
      }

      setIsLoading(false);
    }

    loadSettings().catch((error: unknown) => {
      console.error("Failed to load settings", error);
      setIsLoading(false);
    });
  }, []);

  const normalTarget = useMemo(() => targets.find((item) => item.dayType === "normal"), [targets]);
  const strengthTarget = useMemo(() => targets.find((item) => item.dayType === "strength"), [targets]);

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !normalTarget || !strengthTarget) return;

    setIsSaving(true);
    const timestamp = nowISO();

    const updatedProfile: Profile = {
      ...profile,
      heightCm: parseNumber(profileForm.heightCm) || undefined,
      currentWeightKg: parseNumber(profileForm.currentWeightKg) || undefined,
      goalWeightKg: parseNumber(profileForm.goalWeightKg) || undefined,
      updatedAt: timestamp,
    };

    const updatedNormal: DayTarget = {
      ...normalTarget,
      kcalMin: parseNumber(normalTargetForm.kcalMin),
      kcalMax: parseNumber(normalTargetForm.kcalMax),
      proteinTarget: parseNumber(normalTargetForm.proteinTarget),
      fatMin: parseNumber(normalTargetForm.fatMin),
      fatMax: parseNumber(normalTargetForm.fatMax),
      carbsMin: parseNumber(normalTargetForm.carbsMin),
      carbsMax: parseNumber(normalTargetForm.carbsMax),
      updatedAt: timestamp,
    };

    const updatedStrength: DayTarget = {
      ...strengthTarget,
      kcalMin: parseNumber(strengthTargetForm.kcalMin),
      kcalMax: parseNumber(strengthTargetForm.kcalMax),
      proteinTarget: parseNumber(strengthTargetForm.proteinTarget),
      fatMin: parseNumber(strengthTargetForm.fatMin),
      fatMax: parseNumber(strengthTargetForm.fatMax),
      carbsMin: parseNumber(strengthTargetForm.carbsMin),
      carbsMax: parseNumber(strengthTargetForm.carbsMax),
      updatedAt: timestamp,
    };

    await profileRepo.upsert(updatedProfile);
    await dayTargetRepo.upsertMany([updatedNormal, updatedStrength]);

    setProfile(updatedProfile);
    setTargets((prev) => prev.map((item) => (item.dayType === "normal" ? updatedNormal : item.dayType === "strength" ? updatedStrength : item)));
    setIsSaving(false);
  }

  function lockAdminMode() {
    setAdminUnlocked(false);
    setAdminUnlockedState(false);
    setAdminLogin("");
    setAdminPassword("");
    setAdminMessage("Режим администратора выключен на этом устройстве.");
  }

  function loginAdminMode() {
    if (!validateAdminCredentials(adminLogin.trim(), adminPassword)) {
      setAdminMessage("Неверный логин или пароль.");
      return;
    }
    setAdminUnlocked(true);
    setAdminUnlockedState(true);
    setAdminLogin("");
    setAdminPassword("");
    setAdminMessage("Режим администратора включен.");
  }

  if (isLoading) return <section className="py-4 text-sm text-[#9db0c8]">Загрузка...</section>;

  return (
    <section className="space-y-4 pb-2 text-neutral-100">
      <header className="space-y-2">
        <p className="screen-subtitle">Учет и админка</p>
        <h1 className="screen-title">Настройки</h1>
      </header>

      <form onSubmit={saveSettings} className="space-y-4">
        <div className="app-card p-4">
          <p className="mb-3 section-label">Профиль</p>
          <div className="grid grid-cols-1 gap-2">
            <Field
              label="Рост, см"
              value={profileForm.heightCm}
              onChange={(value) => setProfileForm((prev) => ({ ...prev, heightCm: value }))}
            />
            <Field
              label="Текущий вес, кг"
              value={profileForm.currentWeightKg}
              onChange={(value) => setProfileForm((prev) => ({ ...prev, currentWeightKg: value }))}
            />
            <Field
              label="Цель, кг"
              value={profileForm.goalWeightKg}
              onChange={(value) => setProfileForm((prev) => ({ ...prev, goalWeightKg: value }))}
            />
          </div>
        </div>

        <TargetBlock title="Цели: обычный день" form={normalTargetForm} onChange={setNormalTargetForm} />
        <TargetBlock title="Цели: силовой день" form={strengthTargetForm} onChange={setStrengthTargetForm} />

        <div className="app-card p-4">
          <p className="mb-3 section-label">Администратор</p>
          {adminUnlocked ? (
            <div className="space-y-2">
              <p className="text-sm text-[#b8c7da]">Режим администратора активен на этом устройстве.</p>
              <button type="button" onClick={lockAdminMode} className="h-12 w-full rounded-2xl danger-btn text-sm font-semibold">
                Выключить режим администратора
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[#9db0c8]">Введи логин и пароль админа для доступа к редактированию продуктов и рецептов.</p>
              <Field label="Логин" value={adminLogin} onChange={setAdminLogin} />
              <Field label="Пароль" value={adminPassword} onChange={setAdminPassword} inputType="password" />
              <button type="button" onClick={loginAdminMode} className="h-12 w-full rounded-2xl accent-btn text-sm font-semibold">
                Включить режим администратора
              </button>
            </div>
          )}
          {adminMessage ? <p className="mt-2 text-xs text-[#9db0c8]">{adminMessage}</p> : null}
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="flex h-12 w-full items-center justify-center rounded-2xl accent-btn text-sm font-semibold disabled:opacity-40"
        >
          {isSaving ? "Сохранение..." : "Сохранить настройки"}
        </button>
      </form>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  inputType = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputType?: "text" | "password";
}) {
  return (
    <label className="space-y-1">
      <span className="field-label">{label}</span>
      <input
        type={inputType}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field-input"
      />
    </label>
  );
}

function TargetBlock({
  title,
  form,
  onChange,
}: {
  title: string;
  form: TargetForm;
  onChange: React.Dispatch<React.SetStateAction<TargetForm>>;
}) {
  return (
    <div className="app-card p-4">
      <p className="mb-3 section-label">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Ккал min" value={form.kcalMin} onChange={(value) => onChange((prev) => ({ ...prev, kcalMin: value }))} />
        <Field label="Ккал max" value={form.kcalMax} onChange={(value) => onChange((prev) => ({ ...prev, kcalMax: value }))} />
        <Field
          label="Белки target"
          value={form.proteinTarget}
          onChange={(value) => onChange((prev) => ({ ...prev, proteinTarget: value }))}
        />
        <Field label="Жиры min" value={form.fatMin} onChange={(value) => onChange((prev) => ({ ...prev, fatMin: value }))} />
        <Field label="Жиры max" value={form.fatMax} onChange={(value) => onChange((prev) => ({ ...prev, fatMax: value }))} />
        <Field label="Угл. min" value={form.carbsMin} onChange={(value) => onChange((prev) => ({ ...prev, carbsMin: value }))} />
        <Field label="Угл. max" value={form.carbsMax} onChange={(value) => onChange((prev) => ({ ...prev, carbsMax: value }))} />
      </div>
    </div>
  );
}
