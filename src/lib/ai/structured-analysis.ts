import type { DayLog, DayTarget, PeriodAnalysis, PeriodRangeDays } from "@/lib/data";
import type { NutrientsTotal } from "@/lib/data";

function toFixed(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function buildDayAnalysis(input: {
  dayLog: DayLog;
  target: DayTarget | null;
  consumed: NutrientsTotal;
  netKcal: number;
  micronutrientCoverage: number;
}): NonNullable<DayLog["dayAnalysis"]> {
  const { dayLog, target, consumed, netKcal, micronutrientCoverage } = input;
  if (!target) {
    return {
      summary: "Цели дня не найдены, анализ ограничен.",
      good: [],
      issues: ["Не удалось сравнить с целями дня."],
      nextDayActions: ["Проверь цели в настройках перед следующим днем."],
      limitations: ["Недостаточно данных о целях дня."],
    };
  }

  const kcalTargetMid = (target.kcalMin + target.kcalMax) / 2;
  const fatTargetMid = (target.fatMin + target.fatMax) / 2;
  const carbsTargetMid = (target.carbsMin + target.carbsMax) / 2;
  const kcalDiff = consumed.kcal - kcalTargetMid;
  const proteinDiff = consumed.protein - target.proteinTarget;
  const fatDiff = consumed.fat - fatTargetMid;
  const carbsDiff = consumed.carbs - carbsTargetMid;

  const good: string[] = [];
  const issues: string[] = [];
  const nextDayActions: string[] = [];
  const estimatedWeeklyWeightDeltaKg = -netKcal * 7 / 7700;

  if (consumed.kcal >= target.kcalMin && consumed.kcal <= target.kcalMax) {
    good.push("Калории в целевом диапазоне.");
  } else {
    issues.push(`Калории вне диапазона: ${toFixed(consumed.kcal)} ккал.`);
    nextDayActions.push(kcalDiff > 0 ? "Снизить калорийность части приемов пищи." : "Добавить калории в один из приемов.");
  }

  if (Math.abs(proteinDiff) <= 10) {
    good.push("Белок близко к цели.");
  } else {
    issues.push(`Белок отклонен от цели на ${toFixed(Math.abs(proteinDiff))} г.`);
    nextDayActions.push(proteinDiff > 0 ? "Немного сократить белковые порции." : "Добавить белок в 1-2 приема.");
  }

  if (consumed.fat >= target.fatMin && consumed.fat <= target.fatMax) {
    good.push("Жиры в диапазоне.");
  } else {
    issues.push(`Жиры вне диапазона: ${toFixed(consumed.fat)} г.`);
    nextDayActions.push(fatDiff > 0 ? "Сократить жирные продукты." : "Добавить немного полезных жиров.");
  }

  if (consumed.carbs >= target.carbsMin && consumed.carbs <= target.carbsMax) {
    good.push("Углеводы в диапазоне.");
  } else {
    issues.push(`Углеводы вне диапазона: ${toFixed(consumed.carbs)} г.`);
    nextDayActions.push(carbsDiff > 0 ? "Снизить быстрые углеводы в поздних приемах." : "Добавить углеводы вокруг активного времени.");
  }

  if (dayLog.activeKcal > 0) {
    good.push(`Активность учтена: ${toFixed(dayLog.activeKcal)} ккал.`);
  } else {
    issues.push("Активные ккал не заполнены.");
    nextDayActions.push("В конце дня вносить активные ккал вручную.");
  }

  if (micronutrientCoverage >= 70) {
    good.push(`Микро/витамины учтены для ${toFixed(micronutrientCoverage)}% приемов.`);
  } else if (micronutrientCoverage > 0) {
    issues.push(`Неполный учет микронутриентов: ${toFixed(micronutrientCoverage)}% приемов.`);
    nextDayActions.push("Добавлять микро и витамины в заметки к продуктам.");
  } else {
    issues.push("Нет данных о микронутриентах за день.");
    nextDayActions.push("Заполнять микронутриенты и витамины в карточках продуктов.");
  }

  const trendText =
    estimatedWeeklyWeightDeltaKg > 0.05
      ? `При текущем net-балансе вероятен рост веса около +${toFixed(estimatedWeeklyWeightDeltaKg)} кг/нед.`
      : estimatedWeeklyWeightDeltaKg < -0.05
        ? `При текущем net-балансе вероятно снижение веса около ${toFixed(estimatedWeeklyWeightDeltaKg)} кг/нед.`
        : "По текущему net-балансу вес, вероятно, будет близок к стабильному.";

  return {
    summary: `${issues.length <= 1 ? "День в целом близок к плану." : "Есть заметные отклонения от плана дня."} ${trendText}`,
    good,
    issues,
    nextDayActions,
    limitations: ["Анализ строится только на локальных структурированных данных, без медицинской диагностики."],
  };
}

export function buildPeriodAnalysis(input: {
  rangeDays: PeriodRangeDays;
  startDate: string;
  endDate: string;
  avgWeight: number;
  deltaWeight: number;
  avgKcal: number;
  avgProtein: number;
  avgFat: number;
  avgCarbs: number;
  avgActivity: number;
  completedDays: number;
  planHitRate: number;
  micronutrientCoverage: number;
}): Omit<PeriodAnalysis, "id" | "generatedAt"> {
  const {
    rangeDays,
    startDate,
    endDate,
    avgWeight,
    deltaWeight,
    avgKcal,
    avgProtein,
    avgFat,
    avgCarbs,
    avgActivity,
    completedDays,
    planHitRate,
    micronutrientCoverage,
  } = input;

  const good: string[] = [];
  const issues: string[] = [];
  const improve: string[] = [];
  const reduce: string[] = [];

  if (planHitRate >= 70) {
    good.push(`Высокое попадание в план: ${toFixed(planHitRate)}%.`);
  } else {
    issues.push(`Попадание в план ниже желаемого: ${toFixed(planHitRate)}%.`);
    improve.push("Стабилизировать калории и макросы в будние дни.");
  }

  if (Math.abs(deltaWeight) <= 0.4) {
    good.push("Вес меняется плавно без резких скачков.");
  } else {
    issues.push(`Изменение веса за период: ${deltaWeight > 0 ? "+" : ""}${toFixed(deltaWeight)} кг.`);
  }

  if (avgActivity <= 0) {
    issues.push("Активность заполнена не по всем дням.");
    improve.push("Вносить активные ккал ежедневно.");
  } else {
    good.push(`Средняя активность: ${toFixed(avgActivity)} ккал.`);
  }

  if (avgFat > avgCarbs * 1.1) {
    reduce.push("Избыточно жирные приемы пищи.");
  }

  const enoughMicroData = micronutrientCoverage >= 50;

  return {
    rangeDays,
    startDate,
    endDate,
    summary: `Период ${rangeDays} дней: средние КБЖУ ${toFixed(avgKcal)} / ${toFixed(avgProtein)} / ${toFixed(avgFat)} / ${toFixed(avgCarbs)}.`,
    good,
    issues,
    weightAndProgress: [
      `Средний вес: ${toFixed(avgWeight)} кг.`,
      `Изменение веса: ${deltaWeight > 0 ? "+" : ""}${toFixed(deltaWeight)} кг.`,
      `Завершенных дней: ${completedDays}.`,
    ],
    nutrition: [
      `Средние калории: ${toFixed(avgKcal)} ккал.`,
      `Средние белки/жиры/углеводы: ${toFixed(avgProtein)}/${toFixed(avgFat)}/${toFixed(avgCarbs)} г.`,
      `Процент попадания в план: ${toFixed(planHitRate)}%.`,
    ],
    activity: [`Средняя активность: ${toFixed(avgActivity)} ккал.`],
    micronutrients: enoughMicroData
      ? {
          enoughData: true,
          text: "Данные по микронутриентам частично доступны, вывод предварительный и зависит от полноты карточек продуктов.",
        }
      : {
          enoughData: false,
          text: "Недостаточно данных для точного анализа микронутриентов.",
        },
    improve,
    reduce,
  };
}
