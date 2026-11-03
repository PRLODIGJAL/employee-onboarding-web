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
