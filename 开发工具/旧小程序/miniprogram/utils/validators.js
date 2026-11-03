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
