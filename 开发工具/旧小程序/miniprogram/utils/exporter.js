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
