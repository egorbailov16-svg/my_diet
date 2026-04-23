"use client";

import { useMemo, useState } from "react";

type Category = {
  emoji: string;
  gradient: [string, string];
  keywords: string[];
};

const CATEGORIES: Category[] = [
  {
    emoji: "🍗",
    gradient: ["#3a2a18", "#241a0e"],
    keywords: ["курица", "куриц", "курины", "грудк", "филе", "индейк", "утк", "гусь"],
  },
  {
    emoji: "🥩",
    gradient: ["#3a1820", "#210a10"],
    keywords: ["говядин", "говяд", "телят", "стейк", "ребр", "бифштекс", "котлет"],
  },
  {
    emoji: "🥓",
    gradient: ["#3a2219", "#1e110b"],
    keywords: ["свинин", "ветчин", "бекон", "сало", "окорок", "карбонад"],
  },
  {
    emoji: "🌭",
    gradient: ["#3a2a15", "#21170b"],
    keywords: ["сосиск", "сарделк", "колбас", "шашлык", "бал ык", "буженин"],
  },
  {
    emoji: "🐟",
    gradient: ["#0f2a3a", "#081624"],
    keywords: [
      "рыб",
      "лосос",
      "форел",
      "семг",
      "тунец",
      "треск",
      "минта",
      "скумбр",
      "сельд",
      "окунь",
      "судак",
      "сибас",
      "дорад",
      "палтус",
      "карп",
      "щук",
    ],
  },
  {
    emoji: "🦐",
    gradient: ["#3a1e2a", "#1b0c14"],
    keywords: ["креветк", "кальмар", "осьминог", "мидии", "мидий", "гребеш", "краб", "омар", "морепродукт"],
  },
  {
    emoji: "🥚",
    gradient: ["#3a2f14", "#1c1709"],
    keywords: ["яйц", "яичн", "омлет"],
  },
  {
    emoji: "🥛",
    gradient: ["#1a2538", "#0d1420"],
    keywords: ["молок", "кефир", "ряженк", "простокваш", "сливк", "сметан"],
  },
  {
    emoji: "🧀",
    gradient: ["#3a2c10", "#1c1507"],
    keywords: ["сыр", "моцарелл", "пармезан", "фета", "брын", "рикотт", "маскарпоне", "творог"],
  },
  {
    emoji: "🍦",
    gradient: ["#29183a", "#140a21"],
    keywords: ["йогурт", "мороженое", "творож", "пудинг"],
  },
  {
    emoji: "🍞",
    gradient: ["#3a2615", "#1c120a"],
    keywords: ["хлеб", "булк", "батон", "лаваш", "бублик", "тост", "ролл"],
  },
  {
    emoji: "🥐",
    gradient: ["#3a2b14", "#1c1507"],
    keywords: ["круассан", "булочк", "пирож", "плюшк"],
  },
  {
    emoji: "🍝",
    gradient: ["#3a2815", "#1c1307"],
    keywords: ["паст", "спагетти", "макарон", "лапш", "фетучини", "феттучини", "пенне", "лингвин"],
  },
  {
    emoji: "🍚",
    gradient: ["#1f2a38", "#0f1420"],
    keywords: ["рис", "плов", "ризотто"],
  },
  {
    emoji: "🌾",
    gradient: ["#2a2112", "#150f07"],
    keywords: ["гречк", "овсянк", "овсян", "перловк", "пшен", "пшеничн", "булгур", "кускус", "киноа", "крупа", "каша", "отруб", "мюсл"],
  },
  {
    emoji: "🥔",
    gradient: ["#2a2214", "#140f07"],
    keywords: ["картоф", "картош", "пюре", "драник", "фри"],
  },
  {
    emoji: "🍅",
    gradient: ["#3a1a1a", "#1c0a0a"],
    keywords: ["помидор", "томат", "черри"],
  },
  {
    emoji: "🥒",
    gradient: ["#182a1e", "#0b1410"],
    keywords: ["огурц", "огурец"],
  },
  {
    emoji: "🥕",
    gradient: ["#3a2315", "#1c1007"],
    keywords: ["морков"],
  },
  {
    emoji: "🥦",
    gradient: ["#162a1a", "#0b1410"],
    keywords: ["капуст", "брокколи", "цветная", "кольраб", "брюссельс", "салат", "шпинат", "рукол", "зелен", "латук", "лист"],
  },
  {
    emoji: "🧅",
    gradient: ["#2a2118", "#140f0b"],
    keywords: ["лук", "чеснок", "шалот", "порей"],
  },
  {
    emoji: "🫑",
    gradient: ["#2a1a38", "#140b1c"],
    keywords: ["перец", "болгарск"],
  },
  {
    emoji: "🫘",
    gradient: ["#2a1f12", "#140f07"],
    keywords: ["фасол", "горох", "нут", "чечев", "бобы", "маш", "соя", "соев"],
  },
  {
    emoji: "🍄",
    gradient: ["#2a1e17", "#140e0a"],
    keywords: ["гриб", "шампин", "вешенк", "белый гр", "лисичк", "опят", "опенок"],
  },
  {
    emoji: "🍎",
    gradient: ["#3a1414", "#1c0909"],
    keywords: ["яблок", "яблочн"],
  },
  {
    emoji: "🍌",
    gradient: ["#3a2f10", "#1c1608"],
    keywords: ["банан"],
  },
  {
    emoji: "🍊",
    gradient: ["#3a2110", "#1c1008"],
    keywords: ["апельсин", "мандарин", "грейпфрут", "помел", "свити", "лимон", "лайм"],
  },
  {
    emoji: "🍓",
    gradient: ["#3a152a", "#1c0914"],
    keywords: ["клубник", "земляник"],
  },
  {
    emoji: "🫐",
    gradient: ["#1a1e3a", "#0b0f1c"],
    keywords: ["ягод", "черник", "голубик", "смородин", "малин", "ежевик", "брусник", "клюкв", "вишн", "черешн"],
  },
  {
    emoji: "🍇",
    gradient: ["#291a38", "#140c1c"],
    keywords: ["виноград", "изюм"],
  },
  {
    emoji: "🍉",
    gradient: ["#1e2a18", "#101410"],
    keywords: ["арбуз", "дыня"],
  },
  {
    emoji: "🍐",
    gradient: ["#2a3010", "#141608"],
    keywords: ["груш"],
  },
  {
    emoji: "🥭",
    gradient: ["#3a2612", "#1c1308"],
    keywords: ["манго", "персик", "абрикос", "нектарин", "ананас", "папайя", "маракуй", "киви", "хурм"],
  },
  {
    emoji: "🥜",
    gradient: ["#2a1e14", "#140e0a"],
    keywords: [
      "орех",
      "ореш",
      "миндал",
      "фундук",
      "кешью",
      "кедр",
      "фисташ",
      "арахис",
      "грецк",
      "семечк",
      "кунжут",
      "мак ",
      "паст а арахисовая",
    ],
  },
  {
    emoji: "🍫",
    gradient: ["#2a1710", "#140a08"],
    keywords: ["шокол", "какао", "молочный шок"],
  },
  {
    emoji: "🍰",
    gradient: ["#2a1a2a", "#140c14"],
    keywords: ["торт", "пирог", "чизкейк", "кекс", "эклер", "медовик", "тирамис", "трюфел", "десерт"],
  },
  {
    emoji: "🍪",
    gradient: ["#2a2014", "#140f0a"],
    keywords: ["печен", "вафл", "пряни", "зефир", "мармелад", "пастил", "халв"],
  },
  {
    emoji: "🍬",
    gradient: ["#2a142a", "#140a14"],
    keywords: ["конфет", "леденц", "жвачк", "драже", "шокобон"],
  },
  {
    emoji: "🍯",
    gradient: ["#3a2a10", "#1c1407"],
    keywords: ["мед", "мёд", "сироп"],
  },
  {
    emoji: "🧈",
    gradient: ["#2a2615", "#14120a"],
    keywords: ["масло сливочн", "сливочное масло", "маргарин", "спред", "гхи"],
  },
  {
    emoji: "🫒",
    gradient: ["#1a261a", "#0b140d"],
    keywords: ["оливк", "маслин", "масло оливк", "оливковое масло", "подсолнечное масло", "растительн"],
  },
  {
    emoji: "🧂",
    gradient: ["#1d2026", "#0e1013"],
    keywords: ["соль", "специ", "приправ", "соус", "перец черн", "кетчуп", "майонез", "горчиц", "уксус"],
  },
  {
    emoji: "☕",
    gradient: ["#2a1a10", "#140c08"],
    keywords: ["кофе", "эспрессо", "капучин", "латте", "американ", "мокко"],
  },
  {
    emoji: "🫖",
    gradient: ["#1a2a24", "#0d1412"],
    keywords: ["чай", "матч", "каркаде", "имбирн"],
  },
  {
    emoji: "🥤",
    gradient: ["#1a2138", "#0d1020"],
    keywords: ["сок", "напиток", "лимонад", "газировк", "кола", "квас", "компот", "морс", "энергет"],
  },
  {
    emoji: "💧",
    gradient: ["#0f2638", "#061320"],
    keywords: ["вода", "минерал"],
  },
  {
    emoji: "🍷",
    gradient: ["#2a0e18", "#14050c"],
    keywords: ["вино", "пиво", "алкогол"],
  },
  {
    emoji: "🥗",
    gradient: ["#152a1a", "#081410"],
    keywords: ["салат", "винегрет", "греческий", "цезарь", "овощ"],
  },
  {
    emoji: "🍲",
    gradient: ["#2a1e10", "#140e07"],
    keywords: ["суп", "борщ", "щи", "солянк", "уха", "бульон", "харчо", "лагман", "рассольник", "окрошк"],
  },
  {
    emoji: "🥘",
    gradient: ["#2a1710", "#140a07"],
    keywords: ["рагу", "тушен", "гуляш", "жарк", "плов"],
  },
  {
    emoji: "🍕",
    gradient: ["#2a1410", "#140907"],
    keywords: ["пицц"],
  },
  {
    emoji: "🍔",
    gradient: ["#2a1710", "#140a07"],
    keywords: ["бургер", "сэндвич", "сендвич", "шаверм", "шаурм", "хот-дог", "хотдог", "роллы", "суши"],
  },
  {
    emoji: "🥞",
    gradient: ["#2a2110", "#141007"],
    keywords: ["блин", "оладь", "сырник", "панкейк", "запеканк", "вафл"],
  },
  {
    emoji: "🫔",
    gradient: ["#2a1e10", "#140e07"],
    keywords: ["бутерброд", "тортилья", "бурито", "тако", "пельмен", "вареник", "манты", "хинкал"],
  },
  {
    emoji: "🍩",
    gradient: ["#2a1610", "#140907"],
    keywords: ["пончик", "донат", "круть"],
  },
  {
    emoji: "🌽",
    gradient: ["#2a2210", "#141007"],
    keywords: ["кукуруз"],
  },
  {
    emoji: "🍠",
    gradient: ["#2a1810", "#140c08"],
    keywords: ["батат", "топинамбур", "тыкв", "репа", "свекл", "сельдер", "редис"],
  },
];

const DEFAULT_CATEGORY: Category = {
  emoji: "🍽️",
  gradient: ["#1b2536", "#0c121c"],
  keywords: [],
};

function pickCategory(name: string): Category {
  const lower = name.toLowerCase();
  for (const category of CATEGORIES) {
    for (const keyword of category.keywords) {
      if (lower.includes(keyword)) {
        return category;
      }
    }
  }
  return DEFAULT_CATEGORY;
}

type FoodThumbnailProps = {
  name: string;
  preferredUrl?: string;
  size?: number;
};

export function FoodThumbnail({ name, preferredUrl, size = 52 }: FoodThumbnailProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const category = useMemo(() => pickCategory(name), [name]);
  const style = useMemo(
    () => ({
      width: size,
      height: size,
      background: `linear-gradient(155deg, ${category.gradient[0]}, ${category.gradient[1]})`,
      borderRadius: 16,
    }),
    [category, size],
  );

  if (preferredUrl && !imageFailed) {
    return (
      <img
        src={preferredUrl}
        alt={name}
        className="food-thumb"
        loading="lazy"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div
      aria-label={name}
      className="food-thumb-emoji"
      style={style}
    >
      <span style={{ fontSize: Math.round(size * 0.55), lineHeight: 1 }}>{category.emoji}</span>
    </div>
  );
}
