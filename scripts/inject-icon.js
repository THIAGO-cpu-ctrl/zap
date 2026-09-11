// Injeta o ícone do ZapFamily no .exe (funciona no Linux, sem wine)
// Uso: node scripts/inject-icon.js <caminho-do-exe> <caminho-do-ico>
const ResEdit = require('resedit');
const fs = require('fs');

const exePath = process.argv[2] || 'release/ZapFamily.exe';
const icoPath = process.argv[3] || 'assets/icon.ico';
const RT_ICON_GROUP = 14; // tipo do recurso de grupo de ícones no PE

const data = fs.readFileSync(exePath);
if (data[0] !== 0x4D || data[1] !== 0x5A) throw new Error('Arquivo não é um executável válido (sem MZ)');
console.log('lido:', data.length, 'bytes');

const exe = ResEdit.NtExecutable.from(data);
const res = ResEdit.NtExecutableResource.from(exe);
const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
const iconItems = iconFile.icons.map(i => i.data);
console.log('ícones no .ico:', iconItems.length);

// cria o grupo principal (id 1) ou substitui os existentes
const groups = res.entries.filter(e => e.type === RT_ICON_GROUP);
if (groups.length) {
  for (const g of groups) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, g.id, g.lang, iconItems);
  }
  console.log('ícones substituídos em', groups.length, 'grupo(s)');
} else {
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, iconItems);
  console.log('grupo de ícone principal criado');
}

// textos de versão
try {
  const vis = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  if (vis.length) {
    vis[0].setStringValues({ lang: 1033, codepage: 1200 }, {
      FileDescription: 'ZapFamily — Rede Social',
      ProductName: 'ZapFamily',
      CompanyName: 'ZapFamily',
      OriginalFilename: 'ZapFamily.exe',
      InternalName: 'ZapFamily'
    });
    vis[0].outputToResourceEntries(res.entries);
    console.log('versão atualizada');
  }
} catch (e) { console.log('versão pulada:', e.message); }

res.outputResource(exe, false);
const out = Buffer.from(exe.generate());
fs.writeFileSync(exePath, out);

// valida
const check = ResEdit.NtExecutable.from(fs.readFileSync(exePath));
const res2 = ResEdit.NtExecutableResource.from(check);
const n = res2.entries.filter(e => e.type === RT_ICON_GROUP).length;
console.log('OK! gravado:', out.length, 'bytes | grupos de ícone:', n);
if (!n) throw new Error('Falha: nenhum ícone no exe final');
