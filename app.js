import { openDB, replace, transaction } from "./core/db.js";
import { state, initialize, refresh, pref, setPref } from "./core/state.js";
import { event } from "./core/events.js";
import { validateBackup, exportBackup, restoreBackup } from "./core/backup.js";
import { demoData } from "./core/demo.js";
import { saveTask, taskAction, undoTask } from "./features/tasks.js";
import { saveGoal, changeGoal, archiveGoal } from "./features/goals.js";
import { capture, classify } from "./features/inbox.js";
import { insights } from "./features/analytics.js";
import { uid, now, day, addDays, amount, esc } from "./utils/format.js";
import {
  shell,
  home,
  inbox,
  tasks,
  goals,
  progressView,
  analyticsView,
  captureForm,
  routes,
} from "./ui/views.js";
import { button, icon } from "./ui/components.js";
import { modal, close, toast, formError } from "./ui/feedback.js";
import {
  taskForm,
  taskDetail,
  postpone,
  processItem,
  goalForm,
  goalFields,
  goalDetail,
  progressForm,
  settings,
  confirmDialog,
  areaDetail,
} from "./ui/forms.js";
let route = "home",
  notes = false,
  filters = { status: "pending", area: "", search: "" },
  goalArea = "",
  period = 30,
  pendingImport = null,
  busy = false;
const getTask = (id) => {
  const v = state.tasks.find((t) => t.id === id);
  if (!v) throw Error("Tarefa não encontrada.");
  return v;
};
const getGoal = (id) => {
  const v = state.goals.find((g) => g.id === id);
  if (!v) throw Error("Meta não encontrada.");
  return v;
};
function theme() {
  const value = pref("theme", "system");
  document.documentElement.dataset.theme =
    value === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : value;
}
function render() {
  theme();
  route = location.hash.slice(1) || "home";
  if (!routes.some(([id]) => id === route)) route = "home";
  const views = {
    home: () => home(state),
    inbox: () => inbox(state, notes),
    tasks: () => tasks(state, filters),
    goals: () => goals(state, goalArea),
    progress: () => progressView(state, period),
    analytics: () => analyticsView(state),
  };
  document.querySelector("#app").innerHTML = shell(
    route,
    state,
    views[route](),
  );
  const top = document.querySelector(".topbar");
  top.insertAdjacentHTML(
    "beforeend",
    `<button class="icon-button mobile-settings" data-action="settings" aria-label="Configurações">${icon("settings")}</button>`,
  );
  document.title = `${routes.find(([id]) => id === route)[1]} · Apenas, Faça.`;
  if (pref("demo", false))
    document
      .querySelector("main")
      .insertAdjacentHTML(
        "afterbegin",
        '<div class="demo-banner">Você está explorando dados de exemplo. <button data-action="settings">Gerenciar dados</button></div>',
      );
}
async function updated(message) {
  await refresh();
  render();
  if (message) toast(message);
}
function navigate(to) {
  close();
  if (location.hash === `#${to}`) render();
  else location.hash = to;
}
function whenDate(data) {
  if (data.when === "today") return day();
  if (data.when === "week") {
    const d = new Date();
    return addDays(day(), (7 - d.getDay()) % 7);
  }
  if (data.when === "date") {
    if (!data.dueDate) throw Error("Escolha a data ou selecione “Não sei”.");
    return data.dueDate;
  }
  return null;
}
async function runAction(action, id, el) {
  switch (action) {
    case "close":
      close();
      break;
    case "capture":
      modal(
        "Tirar da cabeça",
        `<p class="quiet">Não precisa organizar agora. Só escrever já é um começo.</p>${captureForm()}`,
      );
      break;
    case "new-task":
      taskForm();
      break;
    case "task":
      taskDetail(getTask(id));
      break;
    case "edit-task":
      taskForm(getTask(id));
      break;
    case "start":
      if (getTask(id).status === "active") {
        taskDetail(getTask(id));
        break;
      }
      await taskAction(id, "started");
      close();
      await updated("Tarefa em andamento. Um passo de cada vez.");
      break;
    case "complete": {
      const result = await taskAction(id, "completed");
      close();
      await updated();
      toast("Tarefa concluída.", async () => {
        await undoTask(result);
        await updated("Conclusão desfeita.");
      });
      break;
    }
    case "postpone":
      postpone(getTask(id));
      break;
    case "cancel-task":
      confirmDialog(
        "Não vou fazer",
        "Remover uma tarefa que perdeu sentido também é organizar sua vida. Ela ficará no histórico como uma decisão, sem contar como conclusão.",
        "confirm-cancel",
        "Não vou fazer",
        id,
      );
      break;
    case "remove-task":
      confirmDialog(
        "Remover tarefa?",
        "A tarefa sai da lista de pendências. Seu histórico é preservado.",
        "confirm-remove",
        "Remover",
        id,
      );
      break;
    case "confirm-cancel":
    case "confirm-remove":
      await taskAction(
        id,
        action === "confirm-cancel" ? "cancelled" : "removed",
      );
      close();
      await updated("Decisão registrada.");
      break;
    case "inbox-tab":
      notes = id === "note";
      render();
      break;
    case "process":
      processItem(state.inbox.find((i) => i.id === id));
      break;
    case "convert-task":
      taskForm(null, id, state.inbox.find((i) => i.id === id).title);
      break;
    case "convert-goal":
      goalForm(null, id, state.inbox.find((i) => i.id === id).title);
      break;
    case "note":
    case "discard":
      await classify(id, action === "note" ? "note" : "discarded");
      close();
      await updated(
        action === "note" ? "Anotação guardada." : "Item descartado.",
      );
      break;
    case "new-goal":
      goalForm();
      break;
    case "goal":
      goalDetail(getGoal(id));
      break;
    case "edit-goal":
      goalForm(getGoal(id));
      break;
    case "add-progress":
      progressForm(getGoal(id));
      break;
    case "step":
      await changeGoal(id, { stepId: el.dataset.step });
      await updated("Etapa atualizada.");
      goalDetail(getGoal(id));
      break;
    case "archive-goal":
      confirmDialog(
        "Arquivar esta meta?",
        "Ela deixa de pedir atenção. Os valores e o histórico continuam disponíveis.",
        "confirm-archive",
        "Arquivar",
        id,
      );
      break;
    case "confirm-archive":
      await archiveGoal(id);
      await updated("Meta arquivada.");
      goalDetail(getGoal(id));
      break;
    case "area":
      areaDetail(id);
      break;
    case "settings":
      settings();
      break;
    case "mute":
      await setPref("muted", { ...pref("muted", {}), [id]: addDays(day(), 7) });
      await updated(
        "Esta análise volta a aparecer em 7 dias, se ainda fizer sentido.",
      );
      break;
    case "insight": {
      const i = insights(state).find((i) => i.id === id);
      if (!i) break;
      if (i.kind === "task") taskDetail(getTask(i.target));
      if (i.kind === "goal") goalDetail(getGoal(i.target));
      if (i.kind === "area") areaDetail(i.target);
      if (i.kind === "late") {
        filters = { status: "late", area: "", search: "" };
        navigate("tasks");
      }
      if (i.kind === "progress") navigate("progress");
      if (i.kind === "backlog") {
        const max = Math.max(1, i.created, i.completed);
        modal(
          "O que entra e o que sai",
          `<p>${esc(i.text)}</p><div class="comparison"><div style="height:${(i.created / max) * 100}%"><b>${i.created}</b><span>Criadas</span></div><div style="height:${Math.max(25, (i.completed / max) * 100)}%"><b>${i.completed}</b><span>Concluídas</span></div></div>${button("Revisar tarefas pendentes", "review-tasks", "", "primary")}`,
        );
      }
      break;
    }
    case "review-tasks":
      filters = { status: "pending", area: "", search: "" };
      navigate("tasks");
      break;
    case "export": {
      const b = await exportBackup();
      const blob = new Blob([JSON.stringify(b, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `apenas-faca-${day()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast("Backup preparado para download.");
      break;
    }
    case "confirm-import":
      if (!pendingImport) throw Error("Selecione o backup novamente.");
      await restoreBackup(pendingImport);
      pendingImport = null;
      close();
      await updated("Backup restaurado.");
      break;
    case "demo":
      confirmDialog(
        "Explorar com exemplos?",
        "Os exemplos substituirão os dados deste navegador. Exporte um backup antes se quiser preservar o que já registrou.",
        "confirm-demo",
        "Substituir por exemplos",
      );
      break;
    case "confirm-demo":
      await replace(demoData());
      close();
      await updated("Exemplos carregados.");
      break;
    case "reset":
      confirmDialog(
        "Limpar todos os dados?",
        "Esta ação apaga tarefas, metas, anotações, áreas e histórico deste navegador. Só um backup permitirá recuperá-los.",
        "confirm-reset",
        "Apagar todos os dados",
      );
      break;
    case "confirm-reset":
      await replace({
        tasks: [],
        goals: [],
        areas: [],
        inbox: [],
        events: [],
        preferences: [],
      });
      await initialize();
      close();
      await updated("Espaço limpo. Pode começar de novo.");
      break;
  }
}
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || busy) return;
  e.preventDefault();
  busy = true;
  try {
    await runAction(el.dataset.action, el.dataset.id || "", el);
  } catch (error) {
    formError(error);
  } finally {
    busy = false;
  }
});
document.addEventListener("submit", async (e) => {
  const f = e.target;
  if (!f.dataset.form) return;
  e.preventDefault();
  if (busy) return;
  busy = true;
  const submit = f.querySelector('button[type="submit"],button:not([type])');
  if (submit) submit.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(f));
    switch (f.dataset.form) {
      case "capture":
        await capture(data.title);
        close();
        await updated("Guardado. Você pode organizar depois.");
        document.querySelector("#capture-title")?.focus();
        break;
      case "quick-task":
        await saveTask({
          title: data.title.trim(),
          description: "",
          areaId: null,
          goalId: null,
          importance: 2,
          dueDate: null,
        });
        await updated("Tarefa adicionada.");
        document.querySelector("#quick-title")?.focus();
        break;
      case "task":
        await saveTask(
          {
            title: data.title.trim(),
            description: data.description || "",
            areaId: data.areaId || null,
            goalId: data.goalId || null,
            importance: Number(data.importance),
            dueDate: whenDate(data),
          },
          f.dataset.id || null,
          f.dataset.inbox || null,
        );
        close();
        await updated("Tarefa salva.");
        break;
      case "postpone":
        await taskAction(f.dataset.id, "postponed", data.dueDate);
        close();
        await updated("Novo momento registrado.");
        break;
      case "goal": {
        const old = f.dataset.id ? getGoal(f.dataset.id) : null;
        const type = old?.type || data.type;
        const steps =
          type === "steps"
            ? old?.steps ||
              data.steps
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean)
                .map((title) => ({ id: uid(), title, done: false }))
            : [];
        if (steps.length > 100 || steps.some((s) => s.title.length > 300))
          throw Error("Use até 100 etapas, com no máximo 300 caracteres cada.");
        const value = {
          title: data.title.trim(),
          description: data.description || "",
          areaId: data.areaId || null,
          type,
          unit: data.unit || "",
          steps,
          targetDate: data.targetDate || null,
          targetValue:
            type === "steps" ? steps.length : amount(data.targetValue, type),
          currentValue:
            old?.currentValue ??
            (type === "steps" ? 0 : amount(data.currentValue, type)),
        };
        const saved = await saveGoal(value, old?.id, f.dataset.inbox || null);
        await updated("Meta salva.");
        goalDetail(getGoal(saved.id));
        break;
      }
      case "goal-progress": {
        const g = getGoal(f.dataset.id),
          v = amount(data.value, g.type);
        if (v <= 0)
          throw Error(
            "Informe um valor maior que zero. Escolha retirada para diminuir.",
          );
        await changeGoal(g.id, {
          delta: v * Number(data.direction),
          note: data.note,
        });
        await updated("Progresso registrado.");
        goalDetail(getGoal(g.id));
        break;
      }
      case "new-area":
      case "rename-area": {
        const name = data.name.trim();
        if (!name) throw Error("Escreva um nome para a área.");
        await transaction(async (tx) => {
          const all = await tx.all("areas");
          if (
            all.some(
              (a) =>
                a.id !== f.dataset.id &&
                a.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
            )
          )
            throw Error("Você já tem uma área com esse nome.");
          const area = f.dataset.id
            ? await tx.get("areas", f.dataset.id)
            : { id: uid(), createdAt: now() };
          area.name = name;
          tx.put("areas", area);
          event(
            tx,
            f.dataset.id ? "area.edited" : "area.created",
            "area",
            area,
          );
        });
        await updated("Área salva.");
        settings();
        break;
      }
    }
  } catch (error) {
    formError(error);
  } finally {
    busy = false;
    if (submit?.isConnected) submit.disabled = false;
  }
});
document.addEventListener("change", async (e) => {
  const el = e.target;
  try {
    switch (el.id) {
      case "task-when":
        document.querySelector("#task-date-label").hidden = el.value !== "date";
        break;
      case "goal-type":
        document.querySelector("#goal-fields").innerHTML = goalFields(el.value);
        break;
      case "task-status":
        filters.status = el.value;
        render();
        break;
      case "task-area":
        filters.area = el.value;
        render();
        break;
      case "goal-area":
        goalArea = el.value;
        render();
        break;
      case "task-search":
        filters.search = el.value;
        render();
        break;
      case "progress-period":
        period = Number(el.value);
        render();
        break;
      case "theme":
        await setPref("theme", el.value);
        await refresh();
        theme();
        break;
      case "import-file": {
        const file = el.files[0];
        if (!file) break;
        if (file.size > 30 * 1024 * 1024)
          throw Error("Este arquivo é grande demais. O limite é 30 MB.");
        let b;
        try {
          b = JSON.parse(await file.text());
        } catch {
          throw Error("Este arquivo não é um JSON válido.");
        }
        validateBackup(b);
        pendingImport = b;
        confirmDialog(
          "Restaurar este backup?",
          `Encontramos ${b.data.tasks.length} tarefas, ${b.data.goals.length} metas e ${b.data.events.length} eventos. Os dados atuais serão substituídos. Exporte-os antes se quiser guardá-los.`,
          "confirm-import",
          "Substituir e restaurar",
        );
        break;
      }
    }
  } catch (error) {
    formError(error);
    el.value = "";
  }
});
window.addEventListener("hashchange", () => {
  close();
  render();
  document.querySelector("main").focus();
  window.scrollTo(0, 0);
});
window.addEventListener("datachange", async () => {
  await refresh();
  render();
  if (document.querySelector("#dialog").open) {
    close();
    toast("Os dados mudaram em outra aba. Reabra o item para continuar.");
  }
});
window.addEventListener("storageclosed", () => {
  document.querySelector("#app").innerHTML =
    '<p class="loading">O armazenamento foi atualizado em outra aba. Recarregue esta página para continuar.</p>';
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", theme);
try {
  await openDB();
  await initialize();
  render();
} catch (error) {
  document.querySelector("#app").innerHTML =
    `<main><h1>Não foi possível abrir seu espaço.</h1><p>Confira se este navegador permite armazenar dados e tente recarregar a página.</p><p>${esc(error.message)}</p><button class="primary" onclick="location.reload()">Tentar novamente</button></main>`;
}
