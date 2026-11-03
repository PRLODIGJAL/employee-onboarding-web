/**
 * 员工信息登记表 —— 表单结构定义（唯一数据源）
 *
 * 依据：《员工信息登记表 2026.10》纸质表 + 花名册（摩卡导入模板）字段
 * 页面、校验、导出全部由这个文件驱动，改字段只改这里，不要动页面代码。
 *
 * 字段属性：
 *   key        存库字段名，上线后不要随意改
 *   label      显示名（尽量与纸质表一致）
 *   type       text | textarea | number | idcard | phone | email | bankcard
 *              | date | month | select | radio | region | yn | image | agree
 *   required   必填（对应纸质表标注，见档案里的"必填口径"）
 *   tip        字段下方的小字说明
 *   placeholder 输入示例
 *   rosterKey  对应花名册（摩卡导入模板）的列名，导出对照表用
 *   showWhen   条件显示 { key, value }，仅当另一字段等于该值时才显示
 *   min/max    数值范围（身高体重用）
 *   suffix     单位后缀
 */
const O = require('./options');

const YES_NO = O.YES_NO;

module.exports = {
  version: '0.2.0',
  title: '员工信息登记表',
  collection: 'onboarding_forms',

  steps: [
    /* ---------------- 1 基本信息 ---------------- */
    {
      key: 'basic',
      title: '基本信息',
      desc: '与身份证保持一致，不要写小名或英文名',
      fields: [
        {
          key: 'realName',
          label: '姓名',
          type: 'text',
          required: true,
          rule: 'name',
          maxLength: 20,
          placeholder: '如：张三',
          rosterKey: 'realname'
        },
        {
          key: 'idcard',
          label: '身份证号',
          type: 'idcard',
          required: true,
          maxLength: 18,
          placeholder: '18 位，最后一位可能是 X',
          tip: '填完会自动核验，并带出性别、出生日期、籍贯',
          rosterKey: 'id_no_id_no'
        },
        {
          key: 'gender',
          label: '性别',
          type: 'radio',
          required: true,
          options: O.GENDER,
          autoFill: true,
          rosterKey: 'gender'
        },
        {
          key: 'birthday',
          label: '出生日期',
          type: 'date',
          required: true,
          autoFill: true,
          rosterKey: 'birthday'
        },
        {
          key: 'nation',
          label: '民族',
          rosterKey: 'nationality',
          type: 'select',
          required: true,
          options: O.NATIONS,
          placeholder: '请选择民族',
          tip: '按身份证上的民族选，共 56 项'
        },
        {
          key: 'nativePlace',
          label: '籍贯',
          type: 'region',
          required: true,
          autoFill: true,
          tip: '点选省 / 市即可，不用手打（只填城市名是最常被退回的错误）',
          rosterKey: 'native_place'
        },
        {
          key: 'marriage',
          label: '婚姻状况',
          type: 'radio',
          required: false,
          options: O.MARRIAGE,
          tip: '纸质表标注"选填"，可以不填',
          rosterKey: 'marital_status'
        },
        {
          key: 'politicalStatus',
          label: '政治面貌',
          type: 'select',
          required: true,
          options: O.POLITICAL,
          placeholder: '请选择（不确定选群众）',
          rosterKey: 'political_status'
        }
      ]
    },

    /* ---------------- 2 学历与资质 ---------------- */
    {
      key: 'edu',
      title: '学历与资质',
      desc: '学历以毕业证为准，本科及以上入职时需交验原件',
      fields: [
        {
          key: 'highestEducation',
          label: '最高学历',
          type: 'select',
          required: true,
          options: O.EDUCATION,
          placeholder: '请选择',
          rosterKey: 'highest_education'
        },
        {
          key: 'graduateSchool',
          label: '毕业学校',
          type: 'text',
          required: true,
          placeholder: '填毕业证上的学校全称',
          rosterKey: 'graduate_school'
        },
        {
          key: 'major',
          label: '所学专业',
          type: 'text',
          required: false,
          placeholder: '如：机电一体化（没有可不填）',
          tip: '选填。没上过学、或者学校不分专业（小学、初中）的，不填也能提交',
          rosterKey: 'profession'
        },
        {
          key: 'graduateDate',
          label: '毕业时间',
          type: 'month',
          required: true,
          tip: '选到年月即可'
        },
        {
          key: 'title',
          rosterKey: 'DF_53c51560b13a471e8a91e4118d911236',
          label: '职称',
          type: 'text',
          required: false,
          placeholder: '如：中级电工，没有可留空'
        },
        {
          key: 'language',
          label: '语言能力',
          type: 'text',
          required: false,
          placeholder: '如：普通话、粤语、英语 CET-4',
          tip: '会几种语言、什么水平，简单写清楚'
        },
        {
          key: 'certificate',
          rosterKey: 'DF_53c51560b13a471e8a91e4118d911236',
          label: '证书',
          type: 'text',
          required: false,
          placeholder: '如：电工证、叉车证、焊工证'
        },
        {
          key: 'height',
          rosterKey: 'DF_a0e18d3956294cfd872433a26f1529db',
          label: '身高',
          type: 'number',
          required: true,
          suffix: 'cm',
          min: 120,
          max: 230,
          placeholder: '如：170'
        },
        {
          key: 'weight',
          rosterKey: 'DF_219e1b641a1848b49c83cac6e4f48e69',
          label: '体重',
          type: 'number',
          required: true,
          suffix: 'kg',
          min: 30,
          max: 200,
          placeholder: '如：65'
        },
        {
          key: 'householdType',
          label: '户口性质',
          type: 'radio',
          required: true,
          options: O.HOUSEHOLD,
          rosterKey: 'household_type'
        },
        {
          key: 'photo',
          label: '照片',
          type: 'image',
          required: false,
          tip: '选填。上传后会贴在登记表的「照片」格里，导出 Word 时一起带出来'
        }
      ]
    },

    /* ---------------- 3 教育与工作经历（表格） ---------------- */
    {
      key: 'history',
      title: '教育与工作经历',
      desc: '教育经历只填最高的一段（学历从高中填起）；工作或实习经历从现在往前写，最近的放第一行（最多两段）',
      fields: [],
      tables: [
        {
          key: 'educations',
          title: '受教育情况',
          rows: 1,
          maxRows: 1,
          requiredRows: 1,
          hint: '学历从高中填起：最高是高中就填高中，是本科就填本科；没读过高中的，这里填初中，小学经历写在同一行后面',
          columns: [
            { key: 'start', label: '开始年月', type: 'month' },
            { key: 'end', label: '结束年月', type: 'month' },
            { key: 'school', label: '学校', type: 'text', placeholder: '学校全称' },
            { key: 'major', label: '专业', type: 'text', optional: true, placeholder: '不分专业的可不填' },
            { key: 'degree', label: '学历', type: 'select', options: O.EDUCATION },
            { key: 'witness', label: '证明人及电话', type: 'text', optional: true, placeholder: '姓名 手机号（可不填）' }
          ]
        },
        {
          key: 'works',
          title: '工作经历或实习经历',
          // 纸质表只有 2 行，这里就只给 2 段：填得下、也印得下，
          // 不会因为写了 3 段把表格撑高、把整份登记表挤到第三页。
          rows: 2,
          maxRows: 2,
          requiredRows: 1,
          // 应届生没有工作经历是常态，硬编一段比空着更糟（档案是假的）。
          // 勾了这个开关，整块按「暂无」处理：不校验、Word 里写"暂无工作经历"。
          noneKey: 'noWork',
          noneLabel: '暂无工作或实习经历（应届生 / 首次就业）',
          noneBtn: '暂无工作经历',
          hint: '最多填两段，工作、实习都算，最近的放第一行；一段都没有就勾右边的「暂无工作经历」',
          columns: [
            { key: 'start', label: '开始年月', type: 'month' },
            { key: 'end', label: '结束年月', type: 'month' },
            { key: 'company', label: '公司名称', type: 'text', placeholder: '公司全称' },
            { key: 'duty', label: '担任职务', type: 'text' },
            { key: 'leave', label: '离职原因及人事证明人电话', type: 'text', placeholder: '原因 + 姓名电话' }
          ]
        }
      ]
    },

    /* ---------------- 4 联系方式 ---------------- */
    {
      key: 'contact',
      title: '联系方式',
      desc: '手机号和地址用于寄劳动合同、工牌，务必填准',
      fields: [
        {
          key: 'phone',
          label: '联系电话',
          type: 'phone',
          required: true,
          maxLength: 11,
          placeholder: '11 位手机号',
          rosterKey: 'telephone'
        },
        {
          key: 'email',
          label: '邮箱',
          type: 'email',
          required: false,
          placeholder: '如：zhangsan@163.com',
          rosterKey: 'personal_email'
        },
        {
          key: 'permanentRegion',
          label: '永久通讯地址',
          type: 'region',
          required: true,
          tip: '必填。能长期收到信件的地址，先选省市再填详细',
          rosterKey: 'address'
        },
        {
          key: 'permanentDetail',
          label: '永久地址详细',
          rosterKey: 'address',
          rosterJoin: ' ',
          type: 'text',
          required: true,
          maxLength: 60,
          placeholder: '如：××镇××村××号',
          tip: '写到村/门牌号，不要只写"××市"'
        },
        {
          key: 'liveRegion',
          label: '现居住地址',
          type: 'region',
          required: false,
          tip: '现在住的地方，方便安排宿舍和班车'
        },
        {
          key: 'liveDetail',
          label: '现居住详细',
          type: 'text',
          required: false,
          maxLength: 60,
          placeholder: '如：××路××号××栋'
        },
        {
          key: 'householdRegion',
          rosterKey: 'DF_5dcb2c0a0c4d44c284a4a338e49ad5e4',
          label: '户口所在地',
          type: 'region',
          required: false,
          tip: '与户口本首页一致'
        },
        {
          key: 'householdDetail',
          rosterKey: 'DF_a76370ac87a64a10870a8d9e3241d1a8',
          label: '户口所在地详细',
          type: 'text',
          required: false,
          maxLength: 60
        },
        {
          key: 'emName',
          label: '紧急联系人姓名',
          type: 'text',
          required: true,
          rule: 'name',
          placeholder: '如：李四',
          tip: '建议填直系亲属',
          rosterKey: 'contact_name'
        },
        {
          key: 'emRelation',
          label: '与本人关系',
          type: 'select',
          required: true,
          options: O.RELATION,
          placeholder: '请选择',
          rosterKey: 'social_relation'
        },
        {
          key: 'emPhone',
          label: '紧急联系人电话',
          type: 'phone',
          required: true,
          maxLength: 11,
          tip: '不能与本人手机号相同',
          rosterKey: 'contact_phone'
        },
        {
          key: 'emAddress',
          label: '紧急联系人地址',
          type: 'text',
          required: true,
          maxLength: 60,
          placeholder: '联系人的常住地址'
        }
      ]
    },

    /* ---------------- 5 其他信息 ---------------- */
    {
      key: 'other',
      title: '其他信息',
      desc: '请如实勾选。选"是"的需要补充一句说明，公司会保密处理',
      fields: [
        {
          key: 'q1',
          rosterKey: 'DF_ea35c316dcaf42c19c9ea1a51a6ede29',
          label: '1、是否有个人贷款，或因替他人做担保等行为未按时履约还清账款',
          type: 'yn',
          required: true
        },
        {
          key: 'q1CreditType',
          label: '信用分类型',
          type: 'radio',
          required: true,
          options: O.CREDIT_TYPE,
          tip: '二选一，填你能查到的那个'
        },
        {
          key: 'q1CreditScore',
          label: '信用分数值',
          type: 'number',
          required: true,
          min: 300,
          max: 950,
          placeholder: '如：680',
          tip: '芝麻信用分一般 350-950，微信支付分一般 300-850'
        },
        {
          key: 'q2',
          rosterKey: 'DF_0acb33c08ddc47fa996a9ac841596e98',
          label: '2、在原单位是否购买社保',
          type: 'yn',
          required: true
        },
        {
          key: 'q3',
          rosterKey: 'DF_b8ad2c91795b437d9586e8c8879758ef',
          label: '3、是否与原单位解除劳动合同、结清权利义务',
          type: 'yn',
          required: true
        },
        {
          key: 'q4',
          rosterKey: 'DF_179b49bfbe3d4884b46e0c196646e519',
          label: '4、是否有重大疾病或慢性疾病',
          type: 'yn',
          required: true
        },
        {
          key: 'q5',
          rosterKey: 'DF_2e110389e8f644ad910e94b67de74dae',
          label: '5、本人是否被追究过刑事责任',
          type: 'yn',
          required: true
        },
        {
          key: 'q6',
          rosterKey: 'DF_630c49ce572d4c98ae45ce9082df12de',
          label: '6、是否有家族传染病、精神病或其他可能影响在用人单位工作的病史',
          type: 'yn',
          required: true,
          allowNote: true,
          noteTip: '若选"是"，请简单说明（公司会保密）'
        },
        {
          key: 'q7',
          rosterKey: 'DF_de7e0ceca774414a811cf3ce65d3a35e',
          label: '7、本人是否与其他单位签订竞业禁止协议或保密协议',
          type: 'yn',
          required: true,
          allowNote: true,
          noteTip: '若选"是"，请写明协议涉及的单位'
        },
        {
          key: 'q8',
          rosterKey: 'DF_283ec4febbbd450c8031ed6a6192a87f',
          label: '8、是否曾被认定为工伤或职业病、持有残疾人证明，或五年内曾患重病住院',
          type: 'yn',
          required: true,
          allowNote: true,
          noteTip: '若选"是"，请简单说明时间与情况'
        },
        {
          key: 'q9',
          rosterKey: 'DF_d189ad5c345b458f994c8571123c755a',
          label: '9、是否被劳动能力鉴定委员会鉴定为具有伤残等级，以及是何级伤残',
          type: 'yn',
          required: true,
          allowNote: true,
          noteTip: '若选"是"，请写明等级'
        },
        {
          key: 'q10',
          rosterKey: 'DF_309fe0758a6f4f6ea264926522f50266',
          label: '10、是否从事过井下、高空、高温、特别繁重体力劳动以及有毒有害工种',
          type: 'yn',
          required: true,
          allowNote: true,
          noteTip: '若选"是"，请写明工种与年限'
        },
        {
          key: 'q11',
          rosterKey: 'DF_c8546fe7c6cc4cdfb9257745cbaa9398',
          label: '11、是否与前用人单位有未尽的法律事宜，包括但不限于劳动纠纷、竞业等',
          type: 'yn',
          required: true,
          allowNote: true,
          noteTip: '若选"是"，请简单说明'
        },
        {
          key: 'q12',
          rosterKey: 'DF_9031cfbdd4394813a75b6684fdde53f3',
          label: '12、是否有亲属在本公司工作',
          type: 'yn',
          required: true
        },
        {
          key: 'q13',
          rosterKey: 'DF_efd75fc2fd09409f8e5e8accc0981498',
          label: '13、是否有兼职工作',
          type: 'yn',
          required: true,
          allowNote: true,
          noteTip: '若选"是"，请提供兼职证明并说明'
        },
        {
          key: 'q14',
          label: '14、曾经有无入职过博迈医疗及其子公司',
          type: 'radio',
          required: true,
          options: ['有', '无']
        },
        {
          key: 'channel',
          label: '从何渠道得知招聘信息',
          type: 'radio',
          // 招聘渠道要进花名册统计（recruitment_channels），空着这一栏 HR 没法算渠道成本，
          // 所以从选填改为必填（2026-10-26）
          required: true,
          options: O.CHANNEL,
          rosterKey: 'recruitment_channels'
        },
        {
          // 选了「经人介绍」才要他继续说清楚：是同事内推，还是中介送来的
          key: 'channelRefType',
          label: '介绍方式',
          type: 'radio',
          required: true,
          options: ['内部推荐', '中介推荐'],
          showWhen: { key: 'channel', value: '经人介绍' }
        },
        {
          key: 'channelRefName',
          label: '内推人姓名',
          type: 'text',
          required: true,
          showWhen: { key: 'channelRefType', value: '内部推荐' },
          placeholder: '推荐你入职的同事叫什么'
        },
        {
          key: 'channelRefRelation',
          label: '与内推人关系',
          type: 'text',
          required: false,
          showWhen: { key: 'channelRefType', value: '内部推荐' },
          placeholder: '如：老乡、朋友、亲戚（可不填）'
        },
        {
          key: 'channelAgency',
          label: '中介公司',
          type: 'select',
          required: true,
          options: ['沃盛', '协和', '大赢'],
          showWhen: { key: 'channelRefType', value: '中介推荐' }
        }
      ]
    },

    /* ---------------- 6 确认提交 ---------------- */
    {
      key: 'confirm',
      title: '确认提交',
      desc: '提交前请再核对一遍身份证号和手机号，这两项填错会影响社保和工资发放',
      fields: [
        {
          key: 'agree',
          label: '声明',
          type: 'agree',
          required: true,
          statement: '本人所提供的一切资料及情况保证真实可靠，并接受贵单位工作所需调查。本人填写的以上任何信息虚假或没有履行以上特殊说明的义务，本人同意被用人单位视为严重违反《劳动合同法》的诚实信用原则，用人单位可以即时解除劳动合同且不用支付经济补偿金。'
        }
      ]
    }
  ]
};
