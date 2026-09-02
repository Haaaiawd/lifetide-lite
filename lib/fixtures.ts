import type { TrialStatus } from "@/lib/working-memory/types";

export type ChoiceOption = {
  id: string;
  label: string;
};

export type Question = {
  id: string;
  wave: number;
  index: number;
  total: number;
  body: string;
  helper?: string;
  options: ChoiceOption[];
};

export type Insight = {
  id: string;
  wave: number;
  facts: string[];
  evidence: string[];
  interpretation: string;
  uncertainty: string;
};

export type PrototypeView = {
  hypothesis: string;
  todayAction: string;
  whatToObserve: string;
  day1: string;
  day2: string;
  day3: string;
  timeCeilingHours: number;
  moneyCeiling: string;
  reversibleBecause: string;
  feedbackSource: string;
  continueSignal: string;
  pauseOrExitNote: string;
  safetyCheck: string;
};

export type Route = {
  id: string;
  number: string;
  title: string;
  coreExperience: string;
  year1: string;
  year2: string;
  year3: string;
  ordinaryDay: string;
  dayNarrative: { scenes: { text: string }[] };
  attractions: string[];
  costsAndTradeoffs: string[];
  evidenceFor: { id: string; supports: string }[];
  assumptions: string[];
  unknowns: string[];
  risks: string[];
  prototype: PrototypeView;
  trialStatus: "not_started" | "active" | "paused" | "completed" | "exited";
};

export const fixtureQuestion: Question = {
  id: "q1",
  wave: 1,
  index: 1,
  total: 4,
  body: "最近半年，你最常因为什么而感到疲惫？",
  helper: "可以选择最贴近的一个；没有标准答案。",
  options: [
    { id: "a", label: "工作内容本身消耗大，但方向还算清楚" },
    { id: "b", label: "方向不清，不确定现在做的事有没有意义" },
    { id: "c", label: "人际关系或环境让人想离开" },
    { id: "d", label: "收入和安全感不够" },
    { id: "e", label: "不是单一原因，很难说清楚" },
  ],
};

export const fixtureInsight: Insight = {
  id: "insight-1",
  wave: 1,
  facts: ["你正在方向不清和意义感的张力中", "疲惫主要不来自任务量"],
  evidence: ["Q1 选择"],
  interpretation:
    "你眼下最需要的不是一份更轻松的工作，而是一个能让你重新解释自己经历的方向。",
  uncertainty: "你更在意的是身份认同、收入下限，还是日常生活的可控感。",
};

export const fixtureRoutes: Route[] = [
  {
    id: "route-continuation",
    number: "01",
    title: "延续线",
    coreExperience: "在当前轨道上争取更多解释空间，而不是只追求晋升。",
    year1: '第一年：在现有领域内部寻找能回答"我究竟在做什么"的小范围角色。',
    year2: "第二年：根据反馈决定是扩大这个新角色，还是换一组人合作。",
    year3: "第三年：把验证过的角色感整合成一段稳定的工作模式。",
    ordinaryDay: "上午处理核心事务，下午留出一小时做跨部门的小型研究或访谈；晚上用简短笔记整理一天的新问题。",
    dayNarrative: {
      scenes: [
        { text: "阳光从窗帘缝隙里漏进来，房间里很安静，能听见远处有鸟叫。" },
        { text: "出门前往包里塞了一本书，是上周读到一半没读完的那本。" },
        { text: "处理完手头的事，留出一小时做跨部门的小型研究，同事路过时聊了两句。" },
        { text: "窗外暗下来，路灯一盏接一盏亮了，走在回去的路上，风有点凉。" },
        { text: "关了灯，想着今天读到的那段话，想着想着就睡着了。" },
      ],
    },
    attractions: ["利用已有的经验和人脉", "风险相对可控", "无需立刻离开熟悉环境"],
    costsAndTradeoffs: ["如果方向迟迟不能重构，可能把厌倦合理化", "新角色不一定能争取到"],
    evidenceFor: [{ id: "e-1", supports: "你提到疲惫来自方向不清" }],
    assumptions: ["组织内部存在解释空间", "同事愿意分享横向经验"],
    unknowns: ["组织是否有足够的空间让你试新角色"],
    risks: ['把"坚持"误当作成长'],
    prototype: {
      hypothesis: "这个方向的日常是否真的适合自己。",
      todayAction: "花 30 分钟列出这个方向需要接触的真实信息源，并预约一次简短访谈或体验。",
      whatToObserve: "注意自己的能量变化、完成最小动作后的感受，以及获得的新信息。",
      day1: "接触一个真实信息源：人、作品、活动或环境。",
      day2: "做一次最小实践：旁听、阅读关键章节、完成一次模拟任务或记录一段真实场景。",
      day3: "写下最明显的吸引点和最不适应的点，并判断是否值得继续。",
      timeCeilingHours: 3,
      moneyCeiling: "0 元或单次公共交通/一杯咖啡",
      reversibleBecause: "三天内只做观察与小步接触，不涉及离开、购买或向他人公开承诺，随时可停止。",
      feedbackSource: "自己的能量变化、具体事件和可接触的人。",
      continueSignal: "想再试一次，或能说出至少一个真实吸引点。",
      pauseOrExitNote: "感到明显消耗、无法完成最小实践，或发现前提假设不成立时，可随时暂停或退出。",
      safetyCheck: "不透露真实身份信息给陌生人，不涉及金钱预付，不影响现有健康或照护安排。",
    },
    trialStatus: "not_started",
  },
  {
    id: "route-adjacent",
    number: "02",
    title: "邻近转向线",
    coreExperience: "把当前能力迁移到相邻领域，保留收入下限的同时验证新方向。",
    year1: "第一年：把现有能力拆解成可迁移的技能组合，并接触相邻领域。",
    year2: "第二年：用兼职、志愿或课程形式做最小实践，收集真实反馈。",
    year3: "第三年：切入一个相邻但不熟悉的赛道，形成稳定生活结构。",
    ordinaryDay: "白天继续本职工作，每周用 6-8 小时做邻近项目的兼职、志愿或课程；周末复盘一次。",
    dayNarrative: {
      scenes: [
        { text: "闹钟响了两遍才起来，厨房里有昨夜剩下的咖啡，热了一下就出门了。" },
        { text: "白天的事还算顺利，下班后赶去参加一个邻近领域的线下活动，到的时候人已经不少。" },
        { text: "和坐在旁边的人聊了几句，对方也在从别的方向转过来，说着说着发现有不少重叠。" },
        { text: "回来路上买了一份宵夜，边走边吃，路灯把影子拉得很长。" },
        { text: "靠着枕头还想再翻几页书，但没翻两页就睡着了。" },
      ],
    },
    attractions: ["保留收入下限", "同时验证新方向", "能力迁移风险相对较低"],
    costsAndTradeoffs: ["时间被挤压", "两三年都可能比较紧", "本职和新方向争夺精力"],
    evidenceFor: [{ id: "e-1", supports: "你提到疲惫来自方向不清" }],
    assumptions: ["邻近领域愿意接受跨背景的人"],
    unknowns: ["新赛道的真实节奏和门槛是否适合自己"],
    risks: ["兼职变成逃避，而不是验证"],
    prototype: {
      hypothesis: "这个方向的日常是否真的适合自己。",
      todayAction: "花 30 分钟列出这个方向需要接触的真实信息源，并预约一次简短访谈或体验。",
      whatToObserve: "注意自己的能量变化、完成最小动作后的感受，以及获得的新信息。",
      day1: "接触一个真实信息源：人、作品、活动或环境。",
      day2: "做一次最小实践：旁听、阅读关键章节、完成一次模拟任务或记录一段真实场景。",
      day3: "写下最明显的吸引点和最不适应的点，并判断是否值得继续。",
      timeCeilingHours: 3,
      moneyCeiling: "0 元或单次公共交通/一杯咖啡",
      reversibleBecause: "三天内只做观察与小步接触，不涉及离开、购买或向他人公开承诺，随时可停止。",
      feedbackSource: "自己的能量变化、具体事件和可接触的人。",
      continueSignal: "想再试一次，或能说出至少一个真实吸引点。",
      pauseOrExitNote: "感到明显消耗、无法完成最小实践，或发现前提假设不成立时，可随时暂停或退出。",
      safetyCheck: "不透露真实身份信息给陌生人，不涉及金钱预付，不影响现有健康或照护安排。",
    },
    trialStatus: "not_started",
  },
  {
    id: "route-release",
    number: "03",
    title: "释放型通配线",
    coreExperience: "用低固定成本探索更不一样的可能，换取最大的信息量和自我认识。",
    year1: "第一年：降低生活固定成本，允许自己尝试不同方向。",
    year2: "第二年：锁定一个或两个最有趣的实验，继续验证。",
    year3: "第三年：把验证过的元素组合成更稳定的生活模式。",
    ordinaryDay: "作息更自主，每周有 2-3 天完全投入探索；其余时间用轻度兼职覆盖基本支出。",
    dayNarrative: {
      scenes: [
        { text: "没有闹钟，是光把自己叫醒的，窗帘没拉严，一条亮线落在地板上。" },
        { text: "上午去了一趟图书馆，翻了几本不相关的书，在其中一本里发现了一个有意思的线索。" },
        { text: "下午做了两小时兼职，剩下的时间沿着河边走了一段，没有特别想什么。" },
        { text: "路过一家小店买了一瓶水，老板在听收音机，新闻里在说今天气温比往年低了两度。" },
        { text: "天黑得很快，第一颗星星已经出来了，站在路口看了一会儿才往回走。" },
      ],
    },
    attractions: ["最大的信息量", "更早知道自己不想要什么", "减少沉没成本"],
    costsAndTradeoffs: ["收入和社会位置的不确定性显著增加", "身边人可能不理解"],
    evidenceFor: [{ id: "e-1", supports: "你提到疲惫来自方向不清" }],
    assumptions: ["探索过程中能维持基本收入和身心健康"],
    unknowns: ["你能在多大程度上容忍没有明确进度的生活"],
    risks: ["探索变成漂移，没有定期复盘"],
    prototype: {
      hypothesis: "这个方向的日常是否真的适合自己。",
      todayAction: "花 30 分钟列出这个方向需要接触的真实信息源，并预约一次简短访谈或体验。",
      whatToObserve: "注意自己的能量变化、完成最小动作后的感受，以及获得的新信息。",
      day1: "接触一个真实信息源：人、作品、活动或环境。",
      day2: "做一次最小实践：旁听、阅读关键章节、完成一次模拟任务或记录一段真实场景。",
      day3: "写下最明显的吸引点和最不适应的点，并判断是否值得继续。",
      timeCeilingHours: 3,
      moneyCeiling: "0 元或单次公共交通/一杯咖啡",
      reversibleBecause: "三天内只做观察与小步接触，不涉及离开、购买或向他人公开承诺，随时可停止。",
      feedbackSource: "自己的能量变化、具体事件和可接触的人。",
      continueSignal: "想再试一次，或能说出至少一个真实吸引点。",
      pauseOrExitNote: "感到明显消耗、无法完成最小实践，或发现前提假设不成立时，可随时暂停或退出。",
      safetyCheck: "不透露真实身份信息给陌生人，不涉及金钱预付，不影响现有健康或照护安排。",
    },
    trialStatus: "not_started",
  },
];
