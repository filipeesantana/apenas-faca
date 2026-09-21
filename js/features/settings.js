/** Ajustes: poucos itens, só o essencial. */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { button, iconButton, segmented, pageHead, sectionHead } from '../ui/components.js';
import { confirmDialog } from '../ui/sheet.js';
import { toast, toastError } from '../ui/toast.js';
import { state, commit, replaceAll } from '../core/store.js';
import { go } from '../core/router.js';
import { listAreas, createArea, renameArea, cycleAreaColor, deleteArea, areaUsage, buildDefaultAreas } from '../domain/areas.js';
import { exportBackup, readBackupFile, applyBackup } from '../data/backup.js';
import { buildDemoData } from '../data/demo.js';
import { relativeTime, formatDateTime } from '../utils/dates.js';
import { plural } from '../utils/numbers.js';

export const APP_VERSION = '1.0.0';

export function applyTheme(theme = 'system') {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  try { localStorage.setItem('af-theme', theme); } catch { /* armazenamento indisponível */ }
  const dark = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]:not([media])')?.setAttribute('content', dark ? '#131210' : '#F5F3EE');
}

export async function loadDemoWithConfirm() {
  const hasData = state.tasks.size || state.goals.size || state.inbox.size;
  if (hasData) {
    const ok = await confirmDialog({
      title: 'Carregar dados de exemplo?',
      message: 'Os dados de exemplo substituem tudo o que está aqui agora. Se quiser guardar seus dados, exporte um backup antes.',
      confirmLabel: 'Substituir pelos exemplos', danger: true,
    });
    if (!ok) return;
  }
  const theme = state.settings.theme;
  const data = buildDemoData();
  await replaceAll({ ...data, settings: { ...data.settings, theme } });
  go('inicio');
  toast('Dados de exemplo carregados. Explore à vontade — dá para limpar em Ajustes.');
}

export async function clearAll({ keepAreas = false } = {}) {
  const theme = state.settings.theme;
  const areas = keepAreas ? [...state.areas.values()] : buildDefaultAreas();
  await replaceAll({ areas, settings: { initialized: true, firstRunAt: Date.now(), theme } });
  go('inicio');
}

export function settingsView() {
  const s = state.settings;
  const view = h('div', { class: 'view view--settings' }, pageHead('Ajustes', null));

  add(view, h('section', { class: 'card section' },
    sectionHead('Aparência'),
    segmented([
      { value: 'system', label: 'Sistema' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Escuro' },
    ], s.theme || 'system', (v) => { applyTheme(v); commit({ settings: { theme: v } }).catch(toastError); }, { label: 'Tema' })));

  add(view, areasSection());

  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'import-file', tabindex: '-1',
    onChange: async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const res = await readBackupFile(file);
        const c = res.counts;
        const ok = await confirmDialog({
          title: 'Restaurar este backup?',
          message: `${res.exportedAt ? `Backup de ${formatDateTime(Date.parse(res.exportedAt))}. ` : ''}Contém ${plural(c.tasks, 'tarefa', 'tarefas')}, ${plural(c.goals, 'meta', 'metas')} e ${plural(c.events, 'registro', 'registros')} de histórico. Os dados atuais serão substituídos.`,
          confirmLabel: 'Restaurar', danger: true,
        });
        if (!ok) return;
        await applyBackup(res);
        applyTheme(state.settings.theme);
        go('inicio');
        toast('Backup restaurado.');
      } catch (err) { toastError(err); }
    },
  });

  add(view, h('section', { class: 'card section' },
    sectionHead('Seus dados'),
    h('p', { class: 'muted' }, 'Tudo fica salvo apenas neste navegador, neste aparelho. Nada é enviado para servidor nenhum. Faça backups de vez em quando — especialmente antes de limpar dados do navegador ou trocar de aparelho.'),
    h('p', { class: 'small' }, s.lastExportAt ? `Último backup: ${relativeTime(s.lastExportAt)}.` : 'Você ainda não fez nenhum backup.'),
    h('div', { class: 'row-actions' },
      button('Exportar backup', { variant: 'primary', icon: 'download', onClick: () => exportBackup().then(() => toast('Backup exportado.')).catch(toastError) }),
      h('label', { class: 'btn btn--secondary', for: 'import-file', tabindex: '0', role: 'button', onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } } },
        icon('upload', { size: 18 }), h('span', null, 'Importar backup')),
      fileInput)));

  add(view, h('section', { class: 'card section' },
    sectionHead('Dados de exemplo'),
    s.demo
      ? [h('p', { class: 'muted' }, 'Você está vendo dados de exemplo. Quando quiser começar de verdade, limpe tudo.'),
        h('div', { class: 'row-actions' }, button('Limpar exemplos e começar', { variant: 'primary', onClick: async () => {
          const ok = await confirmDialog({ title: 'Limpar os dados de exemplo?', message: 'Tudo o que está aqui será apagado e você começa do zero.', confirmLabel: 'Limpar e começar', danger: true });
          if (ok) { await clearAll(); toast('Tudo limpo. Comece tirando algo da cabeça.'); }
        } }))]
      : [h('p', { class: 'muted' }, 'Quer ver como o sistema fica depois de algumas semanas de uso? Carregue um conjunto de exemplo — ele substitui os dados atuais.'),
        h('div', { class: 'row-actions' }, button('Carregar dados de exemplo', { icon: 'layers', onClick: () => loadDemoWithConfirm().catch(toastError) }))]));

  add(view, h('section', { class: 'card section section--danger' },
    sectionHead('Apagar tudo'),
    h('p', { class: 'muted' }, 'Remove todas as tarefas, metas, anotações e o histórico deste navegador. Não dá para desfazer (a não ser que você tenha um backup).'),
    h('div', { class: 'row-actions' }, button('Apagar todos os dados', { variant: 'danger', icon: 'trash', onClick: async () => {
      const ok = await confirmDialog({ title: 'Apagar todos os dados?', message: 'Isso não pode ser desfeito. Considere exportar um backup antes.', confirmLabel: 'Apagar tudo', danger: true });
      if (ok) { await clearAll(); toast('Dados apagados.'); }
    } }))));

  add(view, h('section', { class: 'about' },
    h('p', null, h('strong', null, 'Apenas, Faça.'), ` · versão ${APP_VERSION}`),
    h('p', { class: 'muted small' }, 'Sistema pessoal de execução e acompanhamento. Funciona inteiramente no seu navegador, sem conta e sem servidor.'),
    h('p', { class: 'muted small' }, 'Atalho: tecla N abre “Tirar da cabeça” de qualquer tela.'),
    h('p', { class: 'muted small' }, 'Desenvolvido por Filipe Santana')));
  return view;
}

function areasSection() {
  const areas = listAreas();
  const input = h('input', { class: 'input', 'data-key': 'new-area', placeholder: 'Nova área (ex.: Família)', maxlength: 40, 'aria-label': 'Nome da nova área' });
  return h('section', { class: 'card section' },
    sectionHead('Áreas da vida'),
    h('p', { class: 'muted small' }, 'Usadas para agrupar tarefas e metas e para perceber onde sua energia está indo. Toque no ponto colorido para trocar a cor.'),
    h('ul', { class: 'area-edit' }, areas.map((a) => {
      const usage = areaUsage(a.id);
      return h('li', { class: 'area-edit__row', 'data-color': a.color },
        h('button', { type: 'button', class: 'area-swatch', 'aria-label': `Trocar cor de ${a.name}`, title: 'Trocar cor', onClick: () => cycleAreaColor(a.id).catch(toastError) }, h('span', { class: 'area-dot area-dot--lg' })),
        h('input', {
          class: 'input input--bare', value: a.name, 'data-key': `area-name-${a.id}`, maxlength: 40, 'aria-label': `Nome da área ${a.name}`,
          onKeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
          onBlur: (e) => renameArea(a.id, e.target.value).catch((err) => { e.target.value = a.name; toastError(err); }),
        }),
        h('span', { class: 'meta-muted' }, usage.tasks + usage.goals ? `${usage.tasks} tarefas · ${usage.goals} metas` : 'sem uso'),
        iconButton('trash', `Remover área ${a.name}`, async () => {
          const ok = await confirmDialog({
            title: `Remover a área ${a.name}?`,
            message: usage.tasks + usage.goals ? 'As tarefas e metas dessa área continuam existindo, só ficam sem área.' : null,
            confirmLabel: 'Remover', danger: true,
          });
          if (ok) deleteArea(a.id).catch(toastError);
        }, { class: 'icon-btn icon-btn--subtle' }));
    })),
    h('form', {
      class: 'inline-form inline-form--row',
      onSubmit: async (e) => {
        e.preventDefault();
        const name = input.value;
        if (!name.trim()) return;
        try { await createArea(name); input.value = ''; } catch (err) { toastError(err); }
      },
    }, input, button('Adicionar', { type: 'submit', icon: 'plus' })));
}
