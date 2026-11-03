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