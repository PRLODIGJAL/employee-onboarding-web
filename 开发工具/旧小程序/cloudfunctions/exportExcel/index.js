/**
 * exportExcel —— 导出员工数据，产出两个文件
 *
 *   ① 花名册导入（主）：拿摩卡「导入花名册模板」当底板，只往第 6 行起写数据。
 *      模板里的 12 个隐藏工作表、258 条下拉验证、列宽批注全部原样保留，
 *      生成的文件可以直接导入摩卡，不用再手工排版。
 *
 *   ② 员工信息登记表（副）：给人看、用来打印归档的普通 xlsx，不参与系统导入。
 *
 * 设计前提（来自需求）：总花名册是商业秘密，程序不读也不写。
 * 所以这里只接收"本次要导出的人"，生成独立文件，由 HR 手工合并。
 *
 * 入参：
 *   meta    { formNo, createdAt, realName }
 *   rows    string[][]  —— 每行长度 119，按 ROSTER.COLUMNS 顺序，由小程序的
 *                          exporter.buildRosterRow() 生成（字段映射只在那一处维护）
 *   blocks  [{ title, rows:[{ label, value }] }]   —— 打印用的登记表
 *   roster  [{ key, cn, value }]                   —— 字段对照，便于人工核对
 */
const path = require('path');
const cloud = require('wx-server-sdk');
const ExcelJS = require('exceljs');
const { buildRosterXlsx, COL_COUNT } = require('./roster');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const ADMIN_COLLECTION = 'admins';
const TEMPLATE = path.join(__dirname, 'assets', 'roster-template.xlsx');

// 模板里的下拉验证铺到第 105 行，超出就没有下拉了
const MAX_ROWS = 100;

async function isAdmin(openid) {
  if (!openid) return false;
  try {
    const r = await db.collection(ADMIN_COLLECTION).where({ openid, enabled: true }).count();
    return r.total > 0;
  } catch (e) {
    return false;
  }
}

function formatTime(d) {
  if (!d) return '';
  const t = new Date(d);
  if (isNaN(t.getTime())) return '';
  const p = n => (n < 10 ? '0' + n : '' + n);
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
}

const BORDER = {
  top: { style: 'thin', color: { argb: 'FFD9DDE3' } },
  left: { style: 'thin', color: { argb: 'FFD9DDE3' } },
  bottom: { style: 'thin', color: { argb: 'FFD9DDE3' } },
  right: { style: 'thin', color: { argb: 'FFD9DDE3' } }
};

const FILL_HEAD = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F3F5' } };
const FILL_GROUP = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FE' } };

function buildSheetForm(wb, meta, blocks) {
  const ws = wb.addWorksheet('员工信息登记表', { views: [{ state: 'frozen', ySplit: 3 }] });
  ws.columns = [{ width: 26 }, { width: 58 }];

  // 标题
  ws.mergeCells('A1:B1');
  const title = ws.getCell('A1');
  title.value = '员工信息登记表';
  title.font = { size: 16, bold: true, color: { argb: 'FF1F2329' } };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 34;

  // 编号与时间
  ws.mergeCells('A2:B2');
  const sub = ws.getCell('A2');
  sub.value = `登记编号：${meta.formNo || ''}    提交时间：${formatTime(meta.createdAt)}`;
  sub.font = { size: 9, color: { argb: 'FF8A919F' } };
  sub.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(2).height = 20;

  let r = 3;
  (blocks || []).forEach(block => {
    // 分组行
    ws.mergeCells(r, 1, r, 2);
    const gh = ws.getCell(r, 1);
    gh.value = block.title;
    gh.font = { size: 11, bold: true, color: { argb: 'FF1D4ED8' } };
    gh.fill = FILL_GROUP;
    gh.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    gh.border = BORDER;
    ws.getRow(r).height = 24;
    r++;

    (block.rows || []).forEach(row => {
      const c1 = ws.getCell(r, 1);
      const c2 = ws.getCell(r, 2);
      c1.value = row.label;
      c2.value = row.value === '' || row.value === undefined || row.value === null ? '—' : String(row.value);
      c1.font = { size: 10, color: { argb: 'FF5F6570' } };
      c2.font = { size: 10, color: { argb: 'FF1F2329' } };
      c1.fill = FILL_HEAD;
      c1.alignment = { vertical: 'middle', wrapText: true };
      c2.alignment = { vertical: 'middle', wrapText: true };
      c1.border = BORDER;
      c2.border = BORDER;
      ws.getRow(r).height = Math.max(20, Math.ceil(String(c2.value).length / 30) * 16);
      r++;
    });
  });

  return ws;
}

function buildSheetRoster(wb, roster) {
  const ws = wb.addWorksheet('花名册对照', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: '花名册字段名', key: 'key', width: 30 },
    { header: '中文名', key: 'cn', width: 18 },
    { header: '本次填写内容', key: 'value', width: 40 }
  ];

  (roster || []).forEach(item => {
    ws.addRow({
      key: item.key || '',
      cn: item.cn || '',
      value: item.value === '' || item.value === undefined || item.value === null ? '' : String(item.value)
    });
  });

  const head = ws.getRow(1);
  head.height = 24;
  head.font = { bold: true, size: 10, color: { argb: 'FF1F2329' } };
  head.fill = FILL_HEAD;
  head.alignment = { vertical: 'middle', horizontal: 'center' };

  for (let i = 1; i <= ws.rowCount; i++) {
    for (let c = 1; c <= 3; c++) {
      ws.getCell(i, c).border = BORDER;
      if (i > 1) ws.getCell(i, c).alignment = { vertical: 'middle', wrapText: true };
    }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 3 } };
  return ws;
}

/* ---------------- 上传并取临时链接 ---------------- */

async function saveAndSign(buffer, fileName) {
  const cloudPath = `exports/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${fileName}`;
  const upload = await cloud.uploadFile({
    cloudPath,
    fileContent: Buffer.from(buffer)
  });

  let tempFileURL = '';
  try {
    const urlRes = await cloud.getTempFileURL({ fileList: [upload.fileID] });
    tempFileURL = (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) || '';
  } catch (e) {
    console.warn('[exportExcel] 取临时链接失败', e.message);
  }

  return { fileID: upload.fileID, tempFileURL, fileName };
}

/** 数据行必须严格是 119 列，少一列就会整表错位 */
function checkRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return '缺少 rows：花名册数据行没传上来';
  if (rows.length > MAX_ROWS) return `一次最多导 ${MAX_ROWS} 人（模板下拉只铺到第 105 行）`;
  for (let i = 0; i < rows.length; i++) {
    if (!Array.isArray(rows[i]) || rows[i].length !== COL_COUNT) {
      return `第 ${i + 1} 行列数是 ${Array.isArray(rows[i]) ? rows[i].length : 0}，应为 ${COL_COUNT}`;
    }
  }
  return '';
}

/** 打印用的登记表（不参与系统导入） */
async function buildRegisterBuffer(meta, blocks, roster) {
  const wb = new ExcelJS.Workbook();
  wb.creator = '员工信息登记';
  wb.created = new Date();

  buildSheetForm(wb, meta, blocks);
  buildSheetRoster(wb, roster);

  const tip = wb.addWorksheet('怎么用这个文件');
  tip.columns = [{ width: 90 }];
  const lines = [
    '这个文件只包含 1 名员工的信息，用途是打印归档。',
    '',
    '要导入摩卡，请用同目录下那份「花名册导入」文件：',
    '1. 那是拿公司模板当底板生成的，表头、隐藏工作表、下拉验证都在；',
    '2. 导入前把「工号」补上（模板里唯一的另一个必填列，由 HR 分配）；',
    '3. 本文件不要拿去导入系统。',
    '',
    '注意：本文件是员工个人资料，请勿转发到群聊或外部邮箱。'
  ];
  lines.forEach((t, i) => {
    const c = tip.getCell(i + 1, 1);
    c.value = t;
    c.font = { size: i === 0 ? 12 : 10, bold: i === 0, color: { argb: i === 0 ? 'FF1F2329' : 'FF4E5969' } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });

  return wb.xlsx.writeBuffer();
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();

  if (!(await isAdmin(OPENID))) {
    return { ok: false, code: 'FORBIDDEN', message: '没有导出权限' };
  }

  const { meta, rows, blocks, roster } = event;
  if (!meta || !meta.formNo) {
    return { ok: false, code: 'BAD_PARAM', message: '缺少登记编号' };
  }

  const bad = checkRows(rows);
  if (bad) {
    return { ok: false, code: 'BAD_PARAM', message: bad };
  }

  const safeName = String(meta.realName || '员工').replace(/[\\/:*?"<>|\s]/g, '');
  const noNo = String(meta.formNo).replace(/[^\w-]/g, '');

  try {
    const files = [];

    // ① 主文件：模板底板 + 数据行，可直接导入摩卡
    const rosterBuf = buildRosterXlsx(TEMPLATE, rows);
    files.push(Object.assign(
      { kind: 'roster' },
      await saveAndSign(rosterBuf, `${safeName}_花名册导入_${noNo}.xlsx`)
    ));

    // ② 副文件：打印用登记表，没传 blocks 就跳过
    if (blocks && blocks.length) {
      const regBuf = await buildRegisterBuffer(meta, blocks, roster);
      files.push(Object.assign(
        { kind: 'register' },
        await saveAndSign(regBuf, `${safeName}_员工信息登记表_${noNo}.xlsx`)
      ));
    }

    // 老调用方只认 fileID / tempFileURL，这里指向主文件
    const primary = files[0];
    return {
      ok: true,
      files,
      fileID: primary.fileID,
      tempFileURL: primary.tempFileURL,
      fileName: primary.fileName
    };
  } catch (err) {
    console.error('[exportExcel] 生成失败', err);
    return { ok: false, code: 'EXPORT_FAIL', message: '导出失败：' + err.message };
  }
};
