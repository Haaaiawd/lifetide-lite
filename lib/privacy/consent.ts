export type ConsentType = "ai" | "upload" | "research";

export type ConsentSpec = {
  type: ConsentType;
  required: boolean;
  given: boolean;
  label: string;
};

export function defaultConsentRecords(): Omit<ConsentSpec, "label">[] {
  return [
    { type: "ai", required: true, given: false },
    { type: "upload", required: false, given: false },
    { type: "research", required: false, given: false },
  ];
}

export function consentCatalog(): ConsentSpec[] {
  return [
    {
      type: "ai",
      required: true,
      given: false,
      label: "允许将我的回答和材料发送给第三方模型，以生成暂定理解和三年路线。",
    },
    {
      type: "upload",
      required: false,
      given: false,
      label: "上传简历、MBTI 报告等文本材料并临时保存 24 小时（可选）。",
    },
    {
      type: "research",
      required: false,
      given: false,
      label: "允许将我的去标识化使用数据用于产品研究（可随时撤回）。",
    },
  ];
}

export function isRequired(type: ConsentType): boolean {
  return type === "ai";
}

export function hasConsent(consents: { type: ConsentType; given: boolean }[], type: ConsentType): boolean {
  return consents.some((c) => c.type === type && c.given);
}

export function canProcess(
  consents: { type: ConsentType; given: boolean }[],
  purpose: "ai" | "upload"
): { allowed: boolean; missing: ConsentType[] } {
  const missing: ConsentType[] = [];
  if (purpose === "ai" && !hasConsent(consents, "ai")) missing.push("ai");
  if (purpose === "upload" && !hasConsent(consents, "upload")) missing.push("upload");
  return { allowed: missing.length === 0, missing };
}
