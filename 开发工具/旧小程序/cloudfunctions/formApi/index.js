/**
 * formApi —— 表单数据接口（提交 / 列表 / 详情）
 *
 * 设计要点：
 * 1. 所有写操作都走云函数，数据库安全规则设为"仅管理端可读写"，前端不能直接改库
 * 2. 前端校验只是体验，服务端必须再校验一遍（前端可以被绕过）
 * 3. 列表接口返回脱敏身份证号，详情接口才返回完整值并校验管理员身份
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const COLLECTION = 'onboarding_forms';
const ADMIN_COLLECTION = 'admins';

/* ---------- 服务端校验 ---------- */

// 必填项（与 miniprogram/config/form-schema.js 保持一致）
const REQUIRED_FIELDS = {
  realName: '姓名',
  idcard: '身份证号',
  gender: '性别',
  birthday: '出生日期',
  nation: '民族',
  nativePlace: '籍贯',
  highestEducation: '最高学历',
  graduateSchool: '毕业学校',
  major: '所学专业',
  graduateDate: '毕业时间',
  height: '身高',
  weight: '体重',
  phone: '联系电话',
  permanentRegion: '永久通讯地址',
  permanentDetail: '永久地址详细',
  emName: '紧急联系人姓名',
  emRelation: '与本人关系',
  emPhone: '紧急联系人电话',
  emAddress: '紧急联系人地址',
  q1: '第 1 题（个人贷款/担保）',
  q1CreditType: '信用分类型',
  q1CreditScore: '信用分数值',
  q2: '第 2 题（原单位社保）',
  q3: '第 3 题（解除劳动合同）',
  q4: '第 4 题（重大疾病）',
  q5: '第 5 题（刑事责任）',
  q6: '第 6 题（家族传染病等病史）',
  q7: '第 7 题（竞业/保密协议）',
  q8: '第 8 题（工伤/职业病/残疾）',
  q9: '第 9 题（伤残等级）',
  q10: '第 10 题（特殊工种）',
  q11: '第 11 题（与前单位法律事宜）',
  q12: '第 12 题（亲属在本公司）',
  q13: '第 13 题（兼职）',
  q14: '第 14 题（曾入职博迈）',
  channel: '从何渠道得知招聘信息'
};

const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CHECK_CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

function checkIdCard(raw) {
  const id = String(raw || '').trim().toUpperCase();
  if (!/^\d{17}[\dX]$/.test(id)) return '身份证号格式不正确';
  const y = +id.substr(6, 4);
  const m = +id.substr(10, 2);
  const d = +id.substr(12, 2);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    return '身份证号中的出生日期不存在';
  }
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += +id[i] * WEIGHTS[i];
  if (CHECK_CODES[sum % 11] !== id[17]) return '身份证号校验位不正确';
  return '';
}

function checkBankCard(raw) {
  const s = String(raw || '').replace(/\s/g, '');
  if (!/^\d{16,19}$/.test(s)) return '银行卡号位数不正确';
  let sum = 0;
  let double = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let d = +s[i];
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0 ? '' : '银行卡号校验不通过';
}

function isEmpty(v) {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0 || v.every(x => !String(x).trim());
  return String(v).trim() === '';
}

function validatePayload(p) {
  for (const key in REQUIRED_FIELDS) {
    if (isEmpty(p[key])) return REQUIRED_FIELDS[key] + ' 为必填项';
  }

  const e1 = checkIdCard(p.idcard);
  if (e1) return e1;

  if (!/^1[3-9]\d{9}$/.test(String(p.phone))) return '联系电话格式不正确';
  if (!/^1[3-9]\d{9}$/.test(String(p.emPhone))) return '紧急联系人电话格式不正确';
  if (String(p.emPhone) === String(p.phone)) return '紧急联系人电话不能与本人手机号相同';
  if (p.email && !/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(String(p.email))) return '邮箱格式不正确';

  // 渠道选"经人介绍"时，介绍人和关系必填
  if (p.channel === '经人介绍') {
    if (isEmpty(p.channelRefName)) return '请填写介绍人姓名';
    if (isEmpty(p.channelRefRelation)) return '请填写与介绍人关系';
  }

  // 声明必须勾选
  if (p.agree !== true) return '请先阅读并勾选声明';

  // 教育、工作经历至少各一段完整记录
  const checkTable = (name, rows, cols) => {
    const ok = (rows || []).some(r => r && cols.every(c => !isEmpty(r[c])));
    return ok ? '' : name + ' 至少填写一段完整记录';
  };
  const e2 = checkTable('教育经历', p.educations, ['start', 'end', 'school', 'major', 'degree']);
  if (e2) return e2;
  const e3 = checkTable('工作经历', p.works, ['start', 'end', 'company', 'duty', 'leave']);
  if (e3) return e3;

  return '';
}

/* ---------- 工具 ---------- */

async function isAdmin(openid) {
  if (!openid) return false;
  try {
    const r = await db.collection(ADMIN_COLLECTION).where({ openid, enabled: true }).count();
    return r.total > 0;
  } catch (e) {
    // admins 集合还没建时不阻塞提交，只是没人有管理权限
    console.warn('[formApi] 管理员校验失败', e.message);
    return false;
  }
}

function maskId(id) {
  const s = String(id || '');
  if (s.length !== 18) return s;
  return s.substr(0, 6) + '********' + s.substr(14, 4);
}

function genFormNo() {
  const d = new Date();
  const pad = n => (n < 10 ? '0' + n : '' + n);
  const day = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RD${day}${rand}`;
}

async function getOpenid(event) {
  // 云函数内拿 openid 的正确姿势：从 getWXContext 取，不要从前端参数取
  const { OPENID } = cloud.getWXContext();
  if (OPENID) return OPENID;
  return event.openid || '';
}

/* ---------- 业务动作 ---------- */

async function submit(payload, openid) {
  const err = validatePayload(payload || {});
  if (err) return { ok: false, code: 'VALIDATE_FAIL', message: err };

  // 同一微信号同一身份证号，只允许一条有效记录
  const dup = await db.collection(COLLECTION)
    .where({ _openid: openid, idcard: payload.idcard, status: _.neq('archived') })
    .count();
  if (dup.total > 0) {
    return { ok: false, code: 'DUPLICATE', message: '你已提交过这份信息，如需修改请联系 HR' };
  }

  const now = db.serverDate();
  const doc = {
    formNo: genFormNo(),
    status: 'pending',          // pending | archived
    _openid: openid,
    payload,
    // 便于列表页筛选和统计的冗余字段
    realName: payload.realName,
    phoneMasked: String(payload.phone || '').replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
    idcardMasked: maskId(payload.idcard),
    gender: payload.gender,
    createdAt: now,
    updatedAt: now
  };

  const res = await db.collection(COLLECTION).add({ data: doc });
  return { ok: true, id: res._id, formNo: doc.formNo };
}

async function list(event, openid) {
  if (!(await isAdmin(openid))) {
    return { ok: false, code: 'FORBIDDEN', message: '没有查看权限' };
  }

  const page = Math.max(1, Number(event.page) || 1);
  const size = Math.min(50, Number(event.size) || 20);
  const where = {};

  if (event.keyword) {
    where.realName = db.RegExp({ regexp: String(event.keyword), options: 'i' });
  }
  if (event.status) where.status = event.status;

  const col = db.collection(COLLECTION);
  const countRes = await col.where(where).count();
  const listRes = await col.where(where)
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * size)
    .limit(size)
    .field({
      formNo: true,
      realName: true,
      gender: true,
      phoneMasked: true,
      idcardMasked: true,
      status: true,
      createdAt: true
    })
    .get();

  return { ok: true, total: countRes.total, page, size, list: listRes.data };
}

async function detail(event, openid) {
  if (!(await isAdmin(openid))) {
    return { ok: false, code: 'FORBIDDEN', message: '没有查看权限' };
  }
  const res = await db.collection(COLLECTION).doc(event.id).get();
  return { ok: true, data: res.data };
}

exports.main = async (event) => {
  const openid = await getOpenid(event);

  try {
    switch (event.action) {
      case 'submit':
        return await submit(event.payload, openid);
      case 'list':
        return await list(event, openid);
      case 'detail':
        return await detail(event, openid);
      default:
        return { ok: false, code: 'BAD_ACTION', message: '未知操作：' + event.action };
    }
  } catch (err) {
    console.error('[formApi] 异常', event.action, err);
    return { ok: false, code: 'SERVER_ERROR', message: '服务异常，请稍后重试' };
  }
};
