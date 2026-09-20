export type FutureReflectionHorizon = 'six-months' | 'five-years'
type FutureImpactKey = 'work' | 'relationships' | 'learning' | 'personal-time' | 'custom'

interface FutureImpactItem {
  title: string
  body: string
  kind?: 'gain' | 'cost'
}

interface FutureImpactProfile {
  actionTitle: string
  inactionTitle: string
  horizons: Record<FutureReflectionHorizon, { action: FutureImpactItem[]; inaction: FutureImpactItem[] }>
  sources: Array<{ label: string; url: string; note: string }>
}

export const horizonOptions: Array<{ value: FutureReflectionHorizon; label: string }> = [
  { value: 'six-months', label: '半年后' },
  { value: 'five-years', label: '五年后' },
]

export const choiceOptions = [
  { value: 'work', label: '工作与机会', text: '争取一个新的工作机会' },
  { value: 'relationships', label: '关系与沟通', text: '和一个重要的人谈谈一直没说的话' },
  { value: 'learning', label: '学习 Python', text: '学习 Python' },
  { value: 'personal-time', label: '为自己留时间', text: '每周为自己在意的事留一点时间' },
] as const

export const customChoice = 'custom'

export const pathLabels: Record<FutureImpactKey, { action: string; inaction: string }> = {
  work: { action: '如果去了解或争取', inaction: '如果暂时不行动' },
  relationships: { action: '如果去沟通', inaction: '如果暂时不谈' },
  learning: { action: '如果开始学习', inaction: '如果暂时不开始' },
  'personal-time': { action: '如果为自己留时间', inaction: '如果暂时不留时间' },
  custom: { action: '如果去做', inaction: '如果暂时不做' },
}

export const impactProfiles: Record<FutureImpactKey, FutureImpactProfile> = {
  learning: {
    actionTitle: '开始学习并持续做项目',
    inactionTitle: '一直没有开始学习',
    horizons: {
      'six-months': {
        action: [
          { title: '能制作简单工具', body: '在持续练习和动手做项目的前提下，你可能已经能写脚本、处理数据，或把一部分重复工作自动化。' },
          { title: '开始留下作品', body: '练习项目可以逐渐变成能运行、能展示的作品，让“学过”变成更具体的能力证据。' },
          { kind: 'cost', title: '学习会占用时间和精力', body: '练习、查错和做项目需要持续投入；如果眼下的时间有限，可能要减少留给其他事情的时间。' },
          { kind: 'cost', title: '投入不一定马上解决问题', body: '课程或项目可能遇到困难，也可能暂时用不上；完成学习本身不保证得到工作或收入。' },
        ],
        inaction: [
          { title: '重复工作仍要手动完成', body: '原本可以用程序处理的整理、计算或批量操作，仍然需要原来的时间和操作方式。' },
          { title: '还没有项目可以展示', body: '没有开始练习，也就不会自然形成代码、工具或项目经历；以后需要时仍要从基础补起。' },
          { kind: 'gain', title: '时间可以留给眼前更重要的事', body: '暂时不学可以保留精力处理当前工作、休息或其他目标；如果近期没有实际编程需求，这可能更合适。' },
          { kind: 'gain', title: '避免为不确定的用途提前投入', body: '先弄清楚现实问题是否真的需要编程，可以减少学了却暂时用不上的投入；以后遇到需要时仍可再开始。' },
        ],
      },
      'five-years': {
        action: [
          { title: '能力可以扩展到多个方向', body: 'Python 被用于 Web、数据分析、科学计算、自动化和软件开发。持续积累可能让你拥有更多解决问题的方式。' },
          { title: '职业选择可能增加', body: '如果同时积累项目、工程能力和领域知识，这项技能可以成为进入软件、数据或自动化相关工作的基础之一；仅会语法并不能保证就业。' },
          { kind: 'cost', title: '能力需要持续练习和更新', body: '如果你希望长期使用编程，工具、项目和相关知识可能需要不断维护；这会持续占用时间，未必符合每个人的优先顺序。' },
          { kind: 'cost', title: '长期投入仍不保证职业转变', body: '即使积累了 Python 经验，职业机会仍受项目质量、领域经验、地区和岗位需求等条件影响。' },
        ],
        inaction: [
          { title: '长期积累没有发生', body: '代码经验、项目作品和解决实际问题的方法都不会自行出现。以后再开始时，这段积累仍需重新投入时间。' },
          { title: '相关机会仍在能力范围之外', body: '需要编程、数据或自动化能力的任务和岗位，仍然较难独立承担；即使机会出现，也可能缺少作品和经验去证明自己。' },
          { kind: 'gain', title: '可以把长期投入留给其他方向', body: '如果编程并非你重视的目标，未投入的时间可以用于其他能力、关系或休息；这不等于选择错误。' },
          { kind: 'gain', title: '避免积累后来并不需要的技能', body: '如果未来的问题不需要编程，暂不投入可能节省长期维护成本；需求变化时仍可按需学习。' },
        ],
      },
    },
    sources: [
      { label: 'Python.org：Python 的应用领域', url: 'https://www.python.org/about/apps/', note: '列出 Web、科学计算、教育、软件开发和商业应用等方向。' },
      { label: 'Python 官方教程', url: 'https://docs.python.org/3/tutorial/', note: '说明 Python 适合脚本和快速应用开发。' },
      { label: '美国劳工统计局：软件开发岗位', url: 'https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm', note: '提供岗位职责、常见教育要求和就业预测；不能推出学会 Python 就一定能就业。' },
    ],
  },
  work: {
    actionTitle: '开始了解并争取新机会',
    inactionTitle: '一直没有接触外部机会',
    horizons: {
      'six-months': {
        action: [
          { title: '获得真实的市场反馈', body: '准备简历、研究岗位和参加沟通后，你会更清楚市场需要什么，以及自己还缺哪些能力和经历。' },
          { title: '开始形成新的选择', body: '投递、交流和面试让潜在机会从想法变成真实接触；结果可能是录用，也可能是更明确的改进方向。' },
          { kind: 'cost', title: '需要投入准备时间', body: '整理经历、筛选岗位和沟通都要占用时间；如果你眼下余力有限，这些投入可能会挤压休息或其他安排。' },
          { kind: 'cost', title: '反馈也可能是否定或不匹配', body: '岗位可能没有回应，或沟通后发现职责、条件和期待不合适；了解机会不保证得到录用。' },
        ],
        inaction: [
          { title: '对外部机会仍然不了解', body: '没有研究岗位和接触市场，就难以知道自己的经验能匹配什么，也得不到简历或面试反馈。' },
          { title: '原有问题可能没有变化', body: '如果你希望解决的工作内容、成长或收入问题没有其他变化，它们可能仍会留在原来的位置；如果问题不存在，这条不适用。' },
          { kind: 'gain', title: '保留当前安排和精力', body: '暂时不投入求职，可以把时间留给眼下更重要的责任、休息或观察；如果时机不合适，这可能是更合适的选择。' },
          { kind: 'gain', title: '避免仓促投入不合适的机会', body: '在目标和条件还不清楚时先不投递，可以避免为了行动而行动；之后仍可在准备更充分时重新评估。' },
        ],
      },
      'five-years': {
        action: [
          { title: '职业路径可能被重新打开', body: '持续了解岗位、补齐能力并建立同行联系，可能带来新的职位、合作关系或发展方向。' },
          { title: '更了解自己的市场位置', body: '多轮真实反馈会让你更清楚优势、差距和合适的工作环境，减少只靠想象判断职业选择。' },
          { kind: 'cost', title: '转变需要持续投入和适应', body: '如果机会带来岗位或行业变化，学习、过渡和适应新环境可能持续一段时间，也可能影响收入或生活安排。' },
          { kind: 'cost', title: '新方向也可能不适合', body: '即使拿到机会，实际职责、团队或条件也可能与预期不同；转换路径不保证长期满意。' },
        ],
        inaction: [
          { title: '外部选择没有积累', body: '没有持续了解行业、建立联系或准备作品，机会出现时可能仍要从信息收集和材料准备开始。' },
          { title: '转换方向可能需要更多准备', body: '如果长期没有了解新行业、建立联系或准备经历，之后转换方向时可能需要从这些准备开始；具体取决于当时的环境。' },
          { kind: 'gain', title: '当前路径可能继续积累', body: '如果现有工作仍提供你重视的经验、关系或稳定，继续投入可能加深这些积累；是否如此取决于你的实际环境。' },
          { kind: 'gain', title: '避免承担不必要的转换成本', body: '如果外部机会并不符合你的需要，暂不转换可能免去一段适应和不确定；以后仍可以根据新信息重新考虑。' },
        ],
      },
    },
    sources: [
      { label: 'CareerOneStop：转换职业或行业指南', url: 'https://cloudfront.careeronestop.org/TridionMultimedia/tcm24-50399_PDF_changeoccupationuserguideACC.pdf', note: '该美国指南建议研究职业、定向修改简历并建立相关联系；页面中的投入和结果仍取决于个人情况，也不代表你所在地区的市场。' },
    ],
  },
  relationships: {
    actionTitle: '选择一次合适的坦诚沟通',
    inactionTitle: '一直不谈这件事',
    horizons: {
      'six-months': {
        action: [
          { title: '让对方知道真实想法', body: '一次清楚、尊重的沟通能把隐藏的信息带进关系，让双方有机会确认理解、需求和边界。' },
          { title: '更早知道关系能否回应', body: '对方可能理解，也可能不同意；真实回应能减少长期猜测，让你知道接下来需要协商、调整还是接受差异。' },
          { kind: 'cost', title: '沟通可能带来分歧', body: '对方未必认同或准备好回应；谈话可能让差异更明显，也需要你承担表达和听取回应的情绪成本。' },
          { kind: 'cost', title: '需要选择合适的时机和方式', body: '准备具体表达、倾听并协商需要时间；如果现在不安全或双方都没有余力，可以先暂停。' },
        ],
        inaction: [
          { title: '误解和猜测继续存在', body: '没有说出的信息无法被对方直接回应，双方仍可能按照各自的猜测理解同一件事。' },
          { title: '问题缺少被处理的机会', body: '如果问题会重复出现，沉默不会自动产生共同方案，积累的不满或距离可能继续保留。' },
          { kind: 'gain', title: '暂时保留现有节奏', body: '如果时机不合适，暂不谈可以避免一次仓促或缺少准备的对话；之后仍能选择更合适的时间。' },
          { kind: 'gain', title: '把精力留给当前更紧要的事', body: '暂缓沟通可以先处理眼前事务或照顾自己的状态；若问题不紧急，这可能是有意的安排。' },
        ],
      },
      'five-years': {
        action: [
          { title: '形成处理重要问题的经验', body: '多次尊重而具体的沟通，可能让双方更熟悉如何表达需要、听取回应和处理分歧。沟通并不保证关系一定改善。' },
          { title: '减少长期建立在猜测上的选择', body: '更早获得真实回应，有助于根据现实关系作决定，而不是一直围绕没有验证的假设生活。' },
          { kind: 'cost', title: '说清差异不代表差异会消失', body: '长期沟通可能让双方更了解彼此，也可能确认重要需要并不一致；之后仍要面对协商、调整或接受差异。' },
          { kind: 'cost', title: '持续维护关系需要投入', body: '如果双方选择继续处理问题，表达、倾听和协商可能反复发生，需要时间和精力。' },
        ],
        inaction: [
          { title: '重要信息长期没有交换', body: '彼此仍可能不了解对方真正重视、介意或需要什么，过去的解释也可能逐渐固化。' },
          { title: '可能在更晚时后悔没有开口', body: '当关系或环境变化后，原本可以交流的窗口可能缩小；届时更难知道一次坦诚沟通是否会带来不同结果。' },
          { kind: 'gain', title: '如果问题自然缓解，避免重复旧矛盾', body: '若问题后来已经消失或双方都不再在意，没有重新提起它可能避免不必要的摩擦；这取决于事情是否真的过去。' },
          { kind: 'gain', title: '为其他关系或责任留出精力', body: '如果这段关系并非当前重点，暂不深入讨论可以把有限精力留给其他责任；用户之后仍可重新选择。' },
        ],
      },
    },
    sources: [
      { label: '夫妻沟通与关系满意度的纵向研究', url: 'https://pubmed.ncbi.nlm.nih.gov/27152050/', note: '研究发现沟通与满意度存在联系，但因果路径并不稳固，因此页面不承诺沟通一定改善关系。' },
    ],
  },
  'personal-time': {
    actionTitle: '把固定时间真正留出来',
    inactionTitle: '继续把时间交给其他安排',
    horizons: {
      'six-months': {
        action: [
          { title: '在意的事开始进入日常', body: '固定时段让阅读、创作、锻炼、陪伴或休息不再只依靠临时空闲，也更容易形成可重复的生活安排。' },
          { title: '更早发现它是否值得继续', body: '真实投入一段时间后，你能依据体验调整频率、内容和边界，而不是一直停留在想象中。' },
          { kind: 'cost', title: '需要从其他安排中腾出时间', body: '保护一段时间可能意味着重新协商家务、工作或陪伴安排；如果当前责任很重，这可能带来实际冲突。' },
          { kind: 'cost', title: '投入后未必得到预期感受', body: '安排了时间不代表活动一定让你放松或满足；可能还要调整活动内容、频率或期待。' },
        ],
        inaction: [
          { title: '它仍然排在其他事情之后', body: '没有明确时间边界时，临时任务和他人需求更容易继续占满日程，在意的事仍难进入生活。' },
          { title: '缺少真实体验来修正判断', body: '没有实际尝试，就难以知道这件事能否带来恢复、满足或新的能力，也无法据此调整安排。' },
          { kind: 'gain', title: '保留处理临时事务的弹性', body: '暂时不固定时间，可以留出更多空间应对眼前变化；如果近期确有紧急责任，这种弹性可能更重要。' },
          { kind: 'gain', title: '避免把不想做的事变成任务', body: '如果这件事其实已不再重要，暂不安排可以避免为了坚持计划而增加负担；之后仍可重新判断。' },
        ],
      },
      'five-years': {
        action: [
          { title: '长期累积出作品、关系或生活习惯', body: '稳定投入可能逐渐形成作品、技能、共同记忆或恢复节奏；结果取决于你把时间用于什么。' },
          { title: '生活中保留由自己决定的部分', body: '持续保护一部分时间，有机会让个人需要和长期价值进入日常安排，而不是只处理眼前要求。' },
          { kind: 'cost', title: '长期保护时间需要不断协调', body: '生活阶段和责任会变化；持续留出固定时间可能需要反复调整安排，也可能与其他重要目标竞争。' },
          { kind: 'cost', title: '积累的形式可能和预期不同', body: '长期投入不保证形成特定作品、技能或关系；活动本身也可能随着兴趣和条件变化。' },
        ],
        inaction: [
          { title: '原本想积累的东西没有形成', body: '没有持续投入，作品、技能、共同记忆或休息习惯都不会因为愿望本身而增长。' },
          { title: '日程继续由眼前事务决定', body: '如果没有新的边界，当前的时间分配方式可能继续延伸，让真正想做的事一再推迟。' },
          { kind: 'gain', title: '时间可以用于其他长期目标', body: '如果其他责任或目标更重要，暂时不保留这段时间可能让你集中投入它们；这取决于你自己的优先顺序。' },
          { kind: 'gain', title: '保留随生活变化调整的空间', body: '不固定某种安排可以让之后按新的兴趣、关系或责任重新分配时间，不必维持已经不合适的习惯。' },
        ],
      },
    },
    sources: [
      { label: 'APA：晚间放松与次日精力研究', url: 'https://www.apa.org/pubs/journals/features/ocp-ocp0000155.pdf', note: '研究讨论工作之外的放松和恢复；具体收益仍取决于活动内容与个人情况。' },
    ],
  },
  custom: {
    actionTitle: '需要先查明会带来什么',
    inactionTitle: '需要先确认会错过什么',
    horizons: {
      'six-months': {
        action: [{ title: '当前不能可靠生成', body: '这是一条自定义内容。现有本地原型没有联网事实检索能力，不能只根据一句话编造它会带来的结果。' }],
        inaction: [{ title: '不能直接写成好处的反面', body: '只有先确认这件事真实可能带来的能力、改变或机会，才能把未获得的部分写成不行动的代价。' }],
      },
      'five-years': {
        action: [{ title: '长期影响需要证据和条件', body: '需要先了解这件事的领域事实、所需投入和你的现实条件，再建立可信的长期影响链。' }],
        inaction: [{ title: '暂不作长期判断', body: '在没有事实依据时，系统不把想象写成你的未来，也不使用空泛模板制造后悔。' }],
      },
    },
    sources: [],
  },
}

export function resolveImpactKey(selectedChoice: string, choice: string): FutureImpactKey {
  if (selectedChoice === 'work' || selectedChoice === 'relationships' || selectedChoice === 'learning' || selectedChoice === 'personal-time') return selectedChoice
  if (/python/i.test(choice)) return 'learning'
  return 'custom'
}

