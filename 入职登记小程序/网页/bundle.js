/* 自动生成，请勿手改。源文件：miniprogram/config/*.js  miniprogram/utils/*.js */
/* 生成命令：node web/build-bundle.js */
(function () {
  'use strict';
  var __defs = {};
  var __cache = {};

  function __resolve(from, to) {
    var base = from.split('/').slice(0, -1);
    to.split('/').forEach(function (seg) {
      if (!seg || seg === '.') return;
      if (seg === '..') base.pop();
      else base.push(seg);
    });
    return base.join('/');
  }

  function __req(from, id) {
    var key = __resolve(from, id);
    if (__cache[key]) return __cache[key].exports;
    if (!__defs[key]) throw new Error('模块未找到: ' + key);
    var mod = { exports: {} };
    __cache[key] = mod;
    __defs[key](mod, mod.exports, function (child) { return __req(key, child); });
    return mod.exports;
  }

  /* ================= config/options ================= */  __defs['config/options'] = function (module, exports, require) {
/**
 * 下拉/单选项集中管理
 * 对接纸质表后，改选项只改这个文件
 */

const NATIONS = [
  '汉族', '蒙古族', '回族', '藏族', '维吾尔族', '苗族', '彝族', '壮族', '布依族', '朝鲜族',
  '满族', '侗族', '瑶族', '白族', '土家族', '哈尼族', '哈萨克族', '傣族', '黎族', '傈僳族',
  '佤族', '畲族', '高山族', '拉祜族', '水族', '东乡族', '纳西族', '景颇族', '柯尔克孜族', '土族',
  '达斡尔族', '仫佬族', '羌族', '布朗族', '撒拉族', '毛南族', '仡佬族', '锡伯族', '阿昌族', '普米族',
  '塔吉克族', '怒族', '乌孜别克族', '俄罗斯族', '鄂温克族', '德昂族', '保安族', '裕固族', '京族', '塔塔尔族',
  '独龙族', '鄂伦春族', '赫哲族', '门巴族', '珞巴族', '基诺族'
];

const GENDER = ['男', '女'];

const MARRIAGE = ['未婚', '已婚', '离异', '丧偶'];

const POLITICAL = ['群众', '共青团员', '中共预备党员', '中共党员', '民主党派', '无党派人士'];

// 这 11 个值 = 摩卡花名册「最高学历」那一列的下拉字典，一个字都不能改，
// 否则导出后导入会校验失败（字典从模板 xlsx 的 dataValidation 里读出来的）。
// 小学 / 初中也要能选：一线员工里确实有人最高学历就是小学毕业。
const EDUCATION = [
  '小学', '初中', '高中', '中专',
  '大专（全日制）', '大专（非全日制）',
  '本科（全日制）', '本科（非全日制）',
  '硕士（全日制）', '硕士（非全日制）', '博士'
];

const HOUSEHOLD = ['农村', '城镇'];

const RELATION = ['父亲', '母亲', '配偶', '子女', '兄弟姐妹', '其他'];

const BANK = ['中国工商银行', '中国农业银行', '中国银行', '中国建设银行', '交通银行',
  '中国邮政储蓄银行', '招商银行', '浦发银行', '中信银行', '中国光大银行', '华夏银行',
  '中国民生银行', '广发银行', '兴业银行', '平安银行', '其他'];

// 从何渠道得知招聘信息
const CHANNEL = ['宣传单', '网络', '厂门口', '经人介绍', '其他途径'];

// 其他信息里的"是/否"题（"是"需补充书面说明的，allowNote=true）
const YES_NO = ['是', '否'];

// 芝麻信用分 / 微信支付分
const CREDIT_TYPE = ['芝麻信用分', '微信支付分'];

module.exports = {
  NATIONS, GENDER, MARRIAGE, POLITICAL, EDUCATION,
  HOUSEHOLD, RELATION, BANK, CHANNEL, YES_NO, CREDIT_TYPE
};

  };

  /* ================= config/roster-template ================= */  __defs['config/roster-template'] = function (module, exports, require) {
/**
 * 摩卡「导入花名册模板」的列定义 —— 固定不变，不要手改
 *
 * 来源：花名册更新 (6).xls → 工作表「导入花名册模板」
 * 提取：2026-10-19，共 119 列
 *
 * 行结构（与原模板逐行一致）：
 *   第 1 行  注意事项（合并单元格）
 *   第 2 行  字段代号（realname / DF_xxx…）
 *   第 3 行  列配置 JSON（isRequired / type）
 *   第 4 行  动作标识 roster/update
 *   第 5 行  中文名
 *   第 6 行起 数据，一人一行
 *
 * 必填列只有两个：realname（*姓名）、employee_no（*工号）
 * 工号由 HR 分配，表单不采集，导出时留空，导入前必须补。
 */

const NAME = '导入花名册模板';

const TITLE = "注意事项：\n1.部门需要填写部门全路径（部门的上级部门为根节点时，填写\"根部门\"；部门为非根部门时，填写\"根部门/一级部门A/...\"）或部门编号（如：NO.383871）;\n2.若部门路径未包含根部门，系统将自动补全路径，如，组织架构中存在下级部门名称和根部门名称一致，请严格按照说明2描述的规范填写;\n3.事件类型及原因仅供创建模式使用, 为入职或重新入职的员工创建数据;\n4.导入员工试用期时，如果仍处在试用期，请填写试用期月数，已完成转正的请填写实际转正日期;\n5.导入已离职员工时，系统通过离职日期进行识别，填写离职日期即为已离职状态;\n6.实际转正日期及离职日期, 仅支持创建时一并维护 (创建一个已转正或已离职员工), 或更新已有日期, 其他转正或离职操作需通过异动记录导入;\n7.重新入职员工，需要先导入已离职的员工信息，再次导入复入职的员工信息，复入职时需标记事件类型为重新入职;";

const TAG = "roster/update";

const COLUMNS = [
  { key: "realname", cn: "*姓名", conf: "{\"isRequired\":1,\"type\":1}" },
  { key: "employee_no", cn: "*工号", conf: "{\"isRequired\":1,\"type\":1}" },
  { key: "realname_pinyin", cn: "姓名拼音", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "event_type", cn: "事件类型", conf: "{\"isRequired\":0,\"type\":19}" },
  { key: "event_reason", cn: "事件原因", conf: "{\"isRequired\":0,\"type\":20}" },
  { key: "employee_type", cn: "员工类型", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "department", cn: "部门（部门全路径或部门编码）", conf: "{\"isRequired\":0,\"type\":12}" },
  { key: "duty", cn: "职务", conf: "{\"isRequired\":0,\"type\":13}" },
  { key: "duty_level", cn: "职级", conf: "{\"isRequired\":0,\"type\":15}" },
  { key: "DF_28f07770cc7546cbbf781f5a0c94fb09", cn: "岗位序列", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_d7df5cf136b348689a46480cf2f4b02d", cn: "标准岗位名称", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "office_address", cn: "工作地点", conf: "{\"isRequired\":0,\"type\":16}" },
  { key: "report_leader", cn: "直接上级", conf: "{\"isRequired\":0,\"type\":17}" },
  { key: "mentor", cn: "导师", conf: "{\"isRequired\":0,\"type\":17}" },
  { key: "on_boarding_date", cn: "入职日期", conf: "{\"isRequired\":0,\"type\":2}" },
  { key: "end_probation_date", cn: "转正日期", conf: "{\"isRequired\":0,\"type\":2}" },
  { key: "company_start_date", cn: "司龄起算日期", conf: "{\"isRequired\":0,\"type\":2}" },
  { key: "months_of_probation", cn: "试用期月数", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "period_end_date", cn: "试用截止日期", conf: "{\"isRequired\":0,\"type\":2}" },
  { key: "remark", cn: "备注", conf: "{\"isRequired\":0,\"type\":11}" },
  { key: "DF_a1fa6ee2a5a540078c116a59fcf1b1da", cn: "职等", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_1da6531a83b947a5bad1edcd33cf39f7", cn: "人员类别", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_5340fdd5d08742839db6cf4b0b3375a3", cn: "岗级", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_9ada4a2fff7d48ff97e3341fcd250e57", cn: "常驻地", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_0df7fa1e827e4e8ab4c4842e12d951cc", cn: "HRBP", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_795f826974db44e1a134399c47dfb2ab", cn: "部门负责人", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_e903321f585043ab8fa07fbc9f3bc810", cn: "岗位级别（一线）", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_88f60568db3242cba223f7ce26946da9", cn: "岗位过渡截止日期", conf: "{\"isRequired\":0,\"type\":2}" },
  { key: "leave_date", cn: "离职日期", conf: "{\"isRequired\":0,\"type\":2}" },
  { key: "leave_detail_reason", cn: "离职详细原因", conf: "{\"isRequired\":0,\"type\":11}" },
  { key: "leave_handle_remark", cn: "离职交接清单", conf: "{\"isRequired\":0,\"type\":11}" },
  { key: "DF_9190b469547c4479a07b3808ba8fb4b7", cn: "是否实施竞业限制（HR建议）", conf: "{\"isRequired\":0,\"type\":4}" },
  { key: "leave_handover_date", cn: "离职交接日期", conf: "{\"isRequired\":0,\"type\":2}" },
  { key: "DF_c1450a519949407a925b0a0dc4d4f307", cn: "是否实施竞业限制（部门决策）", conf: "{\"isRequired\":0,\"type\":4}" },
  { key: "id_no_id_no", cn: "证件/证件号码", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "id_no_id_type", cn: "证件/证件类型", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "gender", cn: "性别", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "birthday", cn: "出生日期", conf: "{\"isRequired\":0,\"type\":2}" },
  { key: "begin_work_time", cn: "首次参加工作时间", conf: "{\"isRequired\":0,\"type\":2}" },
  { key: "bank_card_bank_card", cn: "银行卡/银行卡号", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "bank_card_bank_card_type", cn: "银行卡/银行卡类型", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "bank_card_bank_card_bank", cn: "银行卡/开户行", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "bank_card_bank_card_branch", cn: "银行卡/开户支行", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "DF_7e7c0da67cbd45f08a9ca0e5bbe814eb", cn: "分贝通职级", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "current_year_birthday_date", cn: "本年生日日期", conf: "{\"isRequired\":0,\"type\":2}" },
  { key: "telephone", cn: "本人联系方式", conf: "{\"isRequired\":0,\"type\":7}" },
  { key: "telephone_country_code", cn: "区号", conf: "{\"isRequired\":0,\"type\":7}" },
  { key: "personal_email", cn: "个人邮箱", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "office_email", cn: "公司邮箱", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "address", cn: "永久通讯地址", conf: "{\"isRequired\":0,\"type\":6}" },
  { key: "nationality", cn: "民族", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "country", cn: "国籍", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "native_place", cn: "籍贯", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "political_status", cn: "政治面貌", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "marital_status", cn: "婚姻状况", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_5dcb2c0a0c4d44c284a4a338e49ad5e4", cn: "户籍城市", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "DF_a76370ac87a64a10870a8d9e3241d1a8", cn: "户籍地址", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "household_type", cn: "户口类型", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "highest_education", cn: "最高学历", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "highest_degree", cn: "最高学位", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "graduate_school", cn: "毕业学校", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "profession", cn: "所学专业", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "DF_53c51560b13a471e8a91e4118d911236", cn: "职称或资格证书", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "DF_a0e18d3956294cfd872433a26f1529db", cn: "身高 (cm)", conf: "{\"isRequired\":0,\"type\":3}" },
  { key: "DF_219e1b641a1848b49c83cac6e4f48e69", cn: "体重 (kg)", conf: "{\"isRequired\":0,\"type\":3}" },
  { key: "DF_5786d0ed377b42e893936e940bfb6637", cn: "社保、公积金缴纳地(招聘确认）", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "DF_9aa394eedc8c473d801ac36ba5a8dded", cn: "派遣公司", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_2755375abe0e42dd8dc6b96dda9684a5", cn: "外派开始时间 1", conf: "{\"isRequired\":0,\"type\":2}" },
  { key: "DF_953d011da83e4232be10a1714b44818b", cn: "外派结束日期 1", conf: "{\"isRequired\":0,\"type\":2}" },
  { key: "DF_e402a07b8c4e4a609bb54cf94241ca9a", cn: "东莞市人才认定类别", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "contact_name", cn: "联系人姓名", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "social_relation", cn: "关系", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "contact_phone", cn: "联系人电话", conf: "{\"isRequired\":0,\"type\":7}" },
  { key: "contact_phone_country_code", cn: "区号", conf: "{\"isRequired\":0,\"type\":7}" },
  { key: "recruitment_mode", cn: "招聘模式", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "recruitment_channels", cn: "招聘渠道", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "recruitment_sources", cn: "招聘来源", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "recruitment_number", cn: "招聘需求编号", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "recruitment_name", cn: "招聘需求名称", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "recruit_manager", cn: "招聘负责人", conf: "{\"isRequired\":0,\"type\":17}" },
  { key: "referee_manager", cn: "推荐人", conf: "{\"isRequired\":0,\"type\":17}" },
  { key: "referee_email", cn: "推荐人邮箱", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "referee_telephone", cn: "推荐人手机号", conf: "{\"isRequired\":0,\"type\":7}" },
  { key: "referee_telephone_country_code", cn: "区号", conf: "{\"isRequired\":0,\"type\":7}" },
  { key: "DF_3710d381450345f0a45d9512174587d9", cn: "是否会粤语", conf: "{\"isRequired\":0,\"type\":4}" },
  { key: "DF_df65a94bfc164661ac069653fa0054c7", cn: "有无家族传染病", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_9a95533080e043aaa01d9b5252d121b9", cn: "派入公司", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_a07b49059baf45f2b339ac70d66fbaa5", cn: "健康证体检时间", conf: "{\"isRequired\":0,\"type\":2}" },
  { key: "DF_7f9a3a5863864899a9d7a861e4a3175f", cn: "是否会英语", conf: "{\"isRequired\":0,\"type\":4}" },
  { key: "DF_270615d53d61438695d07cb981888bd5", cn: "有无任何精神疾病", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_a0cdea474e4147b1bc7113a30bd2e58b", cn: "派入部门", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_36c9ab9cdb1041f3ac64cc1522aeacdc", cn: "健康证到期时间", conf: "{\"isRequired\":0,\"type\":2}" },
  { key: "DF_85f785eb6af449e9b4685b0447b6d0b9", cn: "其它语言", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "DF_f3df3fc16a8c4ff6b125b14f0fbab649", cn: "五年内是否曾患重病或因病住院", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_f4ae6bb767fa4e2f8d2c1c6250f86775", cn: "2025年绩效结果等级", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_11985896cfb14693a2d720cfb2e2c940", cn: "外派后岗位", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "DF_969c88fc443444e48b6e56e10dc7a0ec", cn: "语言等级", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "DF_179b49bfbe3d4884b46e0c196646e519", cn: "是否有重大疾病或慢性疾病", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_37e32e4024114ba3831f2a989df23d8a", cn: "外派开始日期", conf: "{\"isRequired\":0,\"type\":2}" },
  { key: "DF_1765d300d02f4b5fbb457725547e0434", cn: "特长", conf: "{\"isRequired\":0,\"type\":11}" },
  { key: "DF_0181eea74dee4d13a8babf0093014867", cn: "是否有过不良行为或触犯法律记录", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_9ba4eb2b651a48adab77c3664f66f315", cn: "外派结束日期", conf: "{\"isRequired\":0,\"type\":2}" },
  { key: "DF_c8546fe7c6cc4cdfb9257745cbaa9398", cn: "是否与原单位产生劳动纠纷", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_6703c3754144438f8b87b338fd3057ed", cn: "派驻地", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_efd75fc2fd09409f8e5e8accc0981498", cn: "有无兼职工作", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_c7783a409044450f9f7bc777ff566ead", cn: "外派事由与目标", conf: "{\"isRequired\":0,\"type\":11}" },
  { key: "DF_9031cfbdd4394813a75b6684fdde53f3", cn: "是否有亲属在本公司工作", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_d098607d1fa04502992b1d12798408ea", cn: "该亲属姓名", conf: "{\"isRequired\":0,\"type\":1}" },
  { key: "DF_5a65648bbdbf4f62b4c548018358894f", cn: "与本人的关系", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_ea35c316dcaf42c19c9ea1a51a6ede29", cn: "是否有个人贷款或因替他人担保等行为，未按时履约还清账款", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_0acb33c08ddc47fa996a9ac841596e98", cn: "在原单位是否购买社保", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_b8ad2c91795b437d9586e8c8879758ef", cn: "是否与原单位解除劳动合同、结清权利义务", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_21d305fca80c4b41985d322ff87afc9f", cn: "是否有重大基本或慢性疾病", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_2e110389e8f644ad910e94b67de74dae", cn: "本人是否被追究过刑事责任", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_630c49ce572d4c98ae45ce9082df12de", cn: "是否有家族传染病、精神病或其他可能影响在用人单位工作的病史", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_de7e0ceca774414a811cf3ce65d3a35e", cn: "本人是否与其他单位签订竞业禁止协议或保密协议", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_283ec4febbbd450c8031ed6a6192a87f", cn: "是否曾被认定为工伤或职业病或持有残疾人证明，或五年内是否曾患重病或因病住院", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_d189ad5c345b458f994c8571123c755a", cn: "是否被劳动能力鉴定委员会鉴定为具有伤残等级以及是何级伤残", conf: "{\"isRequired\":0,\"type\":5}" },
  { key: "DF_309fe0758a6f4f6ea264926522f50266", cn: "是否从事过井下、高空、高温、特别繁重体力劳动已经有毒有害工种", conf: "{\"isRequired\":0,\"type\":5}" },
];

// 员工不用填、但每次导入都需要固定值的列
const FIXED = {
  id_no_id_type: '身份证',
  country: '中国',   // 注意：nationality 在摩卡里是「民族」，不是国籍
  // 摩卡「创建模式」必须带事件类型，否则这一行不生效。
  // 本系统只收新入职员工，所以默认填「入职」；
  // 若将来要导「重新入职」，得先有一条离职记录，并由 HR 手工改这一列。
  event_type: '入职'
};

module.exports = { NAME, TITLE, TAG, COLUMNS, FIXED };
  };

  /* ================= config/form-schema ================= */  __defs['config/form-schema'] = function (module, exports, require) {
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

  };

  /* ================= utils/idcard ================= */  __defs['utils/idcard'] = function (module, exports, require) {
/**
 * 居民身份证号校验与解析（GB 11643 / ISO 7064:1983 MOD 11-2）
 *
 * 只做本地校验，不联网、不上传，用户敲完第 18 位立刻能给出结论。
 */

// 前 17 位的加权因子
const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
// 余数 -> 第 18 位校验码
const CHECK_CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

// 省级行政区划代码（GB/T 2260 前两位，长期稳定）
const PROVINCE_MAP = {
  11: '北京市',
  12: '天津市',
  13: '河北省',
  14: '山西省',
  15: '内蒙古自治区',
  21: '辽宁省',
  22: '吉林省',
  23: '黑龙江省',
  31: '上海市',
  32: '江苏省',
  33: '浙江省',
  34: '安徽省',
  35: '福建省',
  36: '江西省',
  37: '山东省',
  41: '河南省',
  42: '湖北省',
  43: '湖南省',
  44: '广东省',
  45: '广西壮族自治区',
  46: '海南省',
  50: '重庆市',
  51: '四川省',
  52: '贵州省',
  53: '云南省',
  54: '西藏自治区',
  61: '陕西省',
  62: '甘肃省',
  63: '青海省',
  64: '宁夏回族自治区',
  65: '新疆维吾尔自治区',
  71: '台湾省',
  81: '香港特别行政区',
  82: '澳门特别行政区',
  91: '国外'
};

function normalize(id) {
  return String(id == null ? '' : id).trim().replace(/\s/g, '').toUpperCase();
}

/** 把校验码算出来，用于"最后一位应该是 X"这类提示 */
function computeCheckCode(first17) {
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(first17[i]) * WEIGHTS[i];
  return CHECK_CODES[sum % 11];
}

/** 出生日期是否真实存在（排除 2 月 30 日这类） */
function isRealDate(y, m, d) {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function calcAge(birthday) {
  if (!birthday) return null;
  const b = new Date(birthday.replace(/-/g, '/'));
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

/**
 * 校验并解析身份证号
 * @returns {{valid: boolean, code?: string, message?: string, data?: object}}
 */
function checkIdCard(raw) {
  const id = normalize(raw);

  if (!id) {
    return { valid: false, code: 'EMPTY', message: '请填写身份证号' };
  }

  // 15 位旧号：1999 年前签发，现在基本已换证
  if (id.length === 15) {
    return {
      valid: false,
      code: 'LEGACY_15',
      message: '这是 15 位旧版身份证号，请填写 18 位的新证号码'
    };
  }

  if (/[^0-9X]/.test(id)) {
    return {
      valid: false,
      code: 'CHARSET',
      message: '身份证号只能是数字，最后一位可能是 X'
    };
  }

  if (id.length !== 18) {
    const diff = 18 - id.length;
    return {
      valid: false,
      code: 'LENGTH',
      message:
        diff > 0
          ? `身份证号是 18 位，现在只有 ${id.length} 位，还差 ${diff} 位`
          : `身份证号是 18 位，现在填了 ${id.length} 位，多了 ${-diff} 位`
    };
  }

  // 出生日期段（第 7-14 位）
  const y = Number(id.substr(6, 4));
  const m = Number(id.substr(10, 2));
  const d = Number(id.substr(12, 2));

  if (!isRealDate(y, m, d)) {
    return {
      valid: false,
      code: 'BIRTHDAY',
      message: '第 7-14 位的出生日期不存在，请核对是否填反或填错'
    };
  }
  if (y < 1900 || new Date(y, m - 1, d) > new Date()) {
    return {
      valid: false,
      code: 'BIRTHDAY',
      message: '出生日期超出合理范围，请核对'
    };
  }

  // 校验位（第 18 位）
  const expect = computeCheckCode(id.substr(0, 17));
  if (expect !== id[17]) {
    return {
      valid: false,
      code: 'CHECKSUM',
      message: `校验位不对，按前 17 位推算最后一位应该是 ${expect}，请核对`
    };
  }

  const birthday = `${y}-${pad2(m)}-${pad2(d)}`;
  const gender = Number(id[16]) % 2 === 1 ? '男' : '女';
  const provinceCode = id.substr(0, 2);

  return {
    valid: true,
    data: {
      id,
      masked: id.substr(0, 6) + '********' + id.substr(14, 4),
      birthday,
      gender,
      age: calcAge(birthday),
      provinceCode,
      province: PROVINCE_MAP[provinceCode] || '',
      areaCode: id.substr(0, 6)
    }
  };
}

/** 列表页展示用：330102********1234 */
function maskIdCard(raw) {
  const id = normalize(raw);
  if (id.length !== 18) return id;
  return id.substr(0, 6) + '********' + id.substr(14, 4);
}

module.exports = {
  checkIdCard,
  computeCheckCode,
  maskIdCard,
  calcAge,
  PROVINCE_MAP
};

  };

  /* ================= utils/validators ================= */  __defs['utils/validators'] = function (module, exports, require) {
/**
 * 通用字段校验器
 * 每个函数返回 '' 表示通过，返回字符串表示错误提示（直接展示给用户）
 */
const { checkIdCard, calcAge } = require('./idcard');

// 中国大陆手机号：1 开头，第二位 3-9，共 11 位
const PHONE_RE = /^1[3-9]\d{9}$/;
const EMAIL_RE = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;
// 姓名：中文/字母/间隔号，2-20 字
const NAME_RE = /^[\u4e00-\u9fa5·]{2,20}$|^[a-zA-Z\s.]{2,40}$/;

function isEmpty(v) {
  if (v === null || v === undefined) return true;
  // false 视为"未勾选"，等同于没填（声明勾选框的初始值就是 false）
  if (v === false) return true;
  if (Array.isArray(v)) return v.filter(Boolean).length === 0;
  return String(v).trim() === '';
}

function checkPhone(v) {
  const s = String(v).trim();
  if (!s) return '请填写手机号';
  if (!/^\d+$/.test(s)) return '手机号只能填数字，不要加空格或横线';
  if (s.length !== 11) return `手机号是 11 位，现在填了 ${s.length} 位`;
  if (!PHONE_RE.test(s)) return '手机号号段不对，请核对第 2 位（3-9）';
  return '';
}

function checkName(v) {
  const s = String(v).trim();
  if (!s) return '请填写姓名';
  if (!NAME_RE.test(s)) return '姓名请填 2-20 位中文，少数民族姓名可用间隔号「·」';
  return '';
}

/** 银行卡号 Luhn 校验 */
function checkBankCard(v) {
  const s = String(v).replace(/\s/g, '');
  if (!s) return '请填写银行卡号';
  if (!/^\d{16,19}$/.test(s)) return '银行卡号一般是 16-19 位数字，请核对';
  let sum = 0;
  let double = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let d = Number(s[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  // 极少数银行的老卡号不遵循 Luhn，所以提示里留了人工兜底口子
  if (sum % 10 !== 0) return '银行卡号校验不通过，请逐位核对（确认无误可联系 HR 人工登记）';
  return '';
}

function checkEmail(v) {
  const s = String(v).trim();
  if (!s) return '';
  if (!EMAIL_RE.test(s)) return '邮箱格式不对，正确写法如 zhangsan@company.com';
  return '';
}

function isFutureDate(dateStr) {
  const d = new Date(String(dateStr).replace(/-/g, '/'));
  if (isNaN(d.getTime())) return false;
  return d.getTime() > Date.now();
}

/**
 * 单字段校验
 * @param {object} field 字段 schema
 * @param {*} value 当前值
 * @param {object} formValues 整个表单的值（用于交叉校验）
 */
function validateField(field, value, formValues) {
  const empty = isEmpty(value);

  if (field.required && empty) {
    if (field.type === 'region') return '请选择省 / 市 / 区';
    if (field.type === 'yn') return '请选择是或否';
    if (field.type === 'agree') return '请先阅读并勾选声明';
    if (field.type === 'image') return '请上传照片';
    return '此项必填';
  }
  if (empty) return '';

  switch (field.type) {
    case 'idcard': {
      const r = checkIdCard(value);
      return r.valid ? '' : r.message;
    }
    case 'phone':
      return checkPhone(value);
    case 'email':
      return checkEmail(value);
    case 'bankcard':
      return checkBankCard(value);
    case 'number': {
      const n = Number(value);
      if (isNaN(n)) return '请填写数字';
      if (field.min !== undefined && n < field.min) return `不能小于 ${field.min}`;
      if (field.max !== undefined && n > field.max) return `不能大于 ${field.max}`;
      return '';
    }
    case 'text':
    case 'textarea': {
      if (field.rule === 'name') return checkName(value);
      const s = String(value).trim();
      if (field.minLength && s.length < field.minLength) {
        return `至少填 ${field.minLength} 个字`;
      }
      if (field.maxLength && s.length > field.maxLength) {
        return `最多填 ${field.maxLength} 个字`;
      }
      return '';
    }
    case 'region': {
      // 籍贯允许只选到市；地址类要到区
      const arr = Array.isArray(value) ? value.filter(Boolean) : [];
      if (arr.length < (field.minLevel || 2)) return '请至少选到市';
      return '';
    }
    case 'date': {
      if (isFutureDate(value)) return '日期不能晚于今天';
      if (field.minAge) {
        const age = calcAge(value);
        if (age !== null && age < field.minAge) return `需年满 ${field.minAge} 周岁`;
      }
      return '';
    }
    case 'month': {
      if (!/^\d{4}-\d{2}$/.test(String(value))) return '请选择年月';
      if (String(value) > new Date().toISOString().slice(0, 7)) return '年月不能晚于当前月份';
      return '';
    }
    case 'yn':
      if (value !== '是' && value !== '否') return '请选择是或否';
      return '';
    case 'agree':
      return value === true ? '' : '请先阅读并勾选声明';
    default:
      return '';
  }
}

/**
 * 多段经历校验：第一段必填，其余填了一半也要补齐
 *
 * @param {object} block  表块定义
 * @param {Array}  rows   这一段的数据
 * @param {object} values 整张表单的值（用来判断「暂无工作经历」这类开关）
 */
function validateTable(block, rows, values) {
  const errors = {};
  let count = 0;
  // 勾了「暂无工作经历」就整块不校验：这是员工的明确声明，不是漏填
  if (block.noneKey && values && values[block.noneKey] === true) return { errors, count };

  const requiredRows = block.requiredRows || 1;
  // 列级选填：c.optional === true 的列不参与必填校验（比如教育经历里的"专业"）
  const cols = block.columns.filter(c => !c.optional);

  (rows || []).forEach((row, i) => {
    const filled = cols.some(c => !isEmpty(row[c.key]));
    if (!filled && i >= requiredRows) return;

    if (!filled) {
      cols.forEach(c => {
        errors[`${block.key}.${i}.${c.key}`] = '请至少填写一段完整经历';
      });
      count++;
      return;
    }

    cols.forEach(c => {
      if (isEmpty(row[c.key])) {
        errors[`${block.key}.${i}.${c.key}`] = '此项必填';
        count++;
      }
    });
    if (row.start && row.end && String(row.start) > String(row.end)) {
      errors[`${block.key}.${i}.end`] = '结束不能早于开始';
      count++;
    }
  });

  return { errors, count };
}

/**
 * 交叉校验：身份证号自动带出的信息与用户手填的是否冲突
 * 返回 { key: 错误提示 } 对象
 */
function crossValidate(values, idFieldKey) {
  const errors = {};
  const idKey = idFieldKey || 'idcard';
  const raw = values[idKey];
  if (!raw) return errors;

  const r = checkIdCard(raw);
  if (!r.valid) return errors;

  if (values.gender && values.gender !== r.data.gender) {
    errors.gender = `与身份证号推算的性别「${r.data.gender}」不一致，请核对`;
  }

  if (values.birthday) {
    const a = String(values.birthday).replace(/\//g, '-');
    const b = r.data.birthday;
    if (a !== b) {
      errors.birthday = `与身份证号中的出生日期「${b}」不一致，请核对`;
    }
  }

  if (values.phone) {
    const p = checkPhone(values.phone);
    if (p) errors.phone = p;
  }

  return errors;
}

module.exports = {
  validateField,
  validateTable,
  crossValidate,
  checkPhone,
  checkName,
  checkBankCard,
  checkEmail,
  isEmpty
};

  };

  /* ================= utils/exporter ================= */  __defs['utils/exporter'] = function (module, exports, require) {
/**
 * 把表单数据整理成导出用的两块内容：
 *   blocks —— 登记表样式（可打印归档）
 *   roster —— 花名册字段对照（HR 复制进总表用）
 */
const schema = require('../config/form-schema');
const ROSTER = require('../config/roster-template');

function isEmpty(v) {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.filter(Boolean).length === 0;
  return String(v).trim() === '';
}

function fmt(field, value, values) {
  if (value === null || value === undefined) return '';
  switch (field.type) {
    case 'region':
      return Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value);
    case 'yn': {
      const note = values[field.key + 'Note'];
      return note ? `${value}（${note}）` : String(value);
    }
    case 'agree':
      return value === true ? '已勾选同意' : '未勾选';
    case 'image':
      return value ? '已上传' : '';
    case 'month':
    case 'date':
      return String(value);
    default:
      return String(value);
  }
}

/** 条件字段当前是否显示 */
function visible(field, values) {
  if (!field.showWhen) return true;
  return values[field.showWhen.key] === field.showWhen.value;
}

function buildBlocks(values) {
  const blocks = [];

  schema.steps.forEach(step => {
    const rows = [];

    (step.fields || []).forEach(field => {
      if (!visible(field, values)) return;
      const text = fmt(field, values[field.key], values);
      if (isEmpty(text)) return;
      rows.push({ label: field.label, value: text });
    });

    (step.tables || []).forEach(block => {
      // 勾了「暂无工作经历」：这张表不留明细，只写一行"暂无"。
      // 这一行必须出现在 Word 里——档案要能证明"本人声明没有"，而不是漏填。
      if (block.noneKey && values[block.noneKey] === true) {
        rows.push({ label: block.title, value: block.noneLabel || '暂无' });
        return;
      }
      const list = values[block.key] || [];
      list.forEach((row, i) => {
        const filled = block.columns.some(c => !isEmpty(row[c.key]));
        if (!filled) return;
        block.columns.forEach(col => {
          if (isEmpty(row[col.key])) return;
          rows.push({
            label: `${block.title} 第${i + 1}段 · ${col.label}`,
            value: String(row[col.key])
          });
        });
      });
    });

    if (rows.length) blocks.push({ title: step.title, rows });
  });

  return blocks;
}

// 花名册里这几列需要固定值，员工不用填
// 注意：roster 的 nationality 是「民族」（由 nation 字段映射），country 才是「国籍」
const CONSTANTS = [
  { key: 'id_no_id_type', cn: '证件类型', value: '身份证' },
  { key: 'country', cn: '国籍', value: '中国' }
];

function buildRoster(values) {
  const list = [];
  const index = {};

  schema.steps.forEach(step => {
    (step.fields || []).forEach(field => {
      if (!field.rosterKey) return;
      if (!visible(field, values)) return;

      const text = fmt(field, values[field.key], values);

      // 同一列可能对应多个表单字段（如「职称或资格证书」同时收职称与证书），
      // 这种情况合并成一个单元格，而不是谁先谁占位
      if (index[field.rosterKey] !== undefined) {
        const item = list[index[field.rosterKey]];
        const sep = field.rosterJoin === undefined ? ' / ' : field.rosterJoin;
        if (!isEmpty(text)) item.value = item.value ? item.value + sep + text : text;
        return;
      }

      index[field.rosterKey] = list.length;
      list.push({ key: field.rosterKey, cn: field.label, value: text });
    });
  });

  CONSTANTS.forEach(c => {
    if (index[c.key] === undefined) list.push(c);
  });

  return list;
}

/**
 * 生成「导入花名册」格式的一行数据（对齐 119 列）
 *
 * 摩卡导入要求列顺序、行结构完全一致，所以这里不做任何裁剪，
 * 没采集到的列留空字符串，而不是省略（省略会错列）。
 *
 * @returns {string[]} 长度固定 119，与 ROSTER.COLUMNS 一一对应
 */
function buildRosterRow(values) {
  const map = {};
  buildRoster(values).forEach(it => {
    map[it.key] = it.value;
  });

  Object.keys(ROSTER.FIXED).forEach(k => {
    if (!map[k]) map[k] = ROSTER.FIXED[k];
  });

  return ROSTER.COLUMNS.map(c => {
    const v = map[c.key];
    return v === undefined || v === null ? '' : String(v);
  });
}

/** 导入前必须补齐的列（花名册模板里 isRequired=1 的只有这两个） */
function missingRequired(row) {
  const miss = [];
  ROSTER.COLUMNS.forEach((c, i) => {
    if (c.conf.indexOf('"isRequired":1') > -1 && !String(row[i] || '').trim()) {
      miss.push(c.cn.replace(/^\*/, ''));
    }
  });
  return miss;
}

module.exports = {
  buildBlocks,
  buildRoster,
  buildRosterRow,
  missingRequired,
  ROSTER
};

  };

  window.APP = {
    schema: __req('', 'config/form-schema'),
    rosterTemplate: __req('', 'config/roster-template'),
    options: __req('', 'config/options'),
    idcard: __req('', 'utils/idcard'),
    validators: __req('', 'utils/validators'),
    exporter: __req('', 'utils/exporter')
  };
})();
