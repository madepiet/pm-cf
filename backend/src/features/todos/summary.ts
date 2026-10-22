export interface TaskSummary {
  total: number;
  open: number;
  completed: number;
}

export function summarizeTasks(todos: { completed: boolean }[]): TaskSummary {
  const completed = todos.filter((todo) => todo.completed).length;
  return { total: todos.length, open: todos.length - completed, completed };
}
