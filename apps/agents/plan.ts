type TaskStatus = "pending" | "in_progress" | "done";
export type PlanTask = {id:string , description: string ; status : TaskStatus};

type Row = {kind: string ; toolName : string | null ; args :unknown};

export function foldPlan(rows:Row[]):PlanTask[]{
    let tasks: PlanTask[] = [];
    for(const row of rows ){
        if(row.kind !== 'tool_call')continue;
        if(row.toolName === 'create_plan'){
            const a = row.args as {tasks ?:{id:string ; description : string}[]};
            tasks = (a.tasks ?? []).map((t)=> ({...t , status:"pending" as TaskStatus}))
        }else if(row.toolName === "update_task_status"){
            const a = row.args as {taskId?:string  ; status ?: TaskStatus};
            if(!a.status)continue;
            const task = tasks.find((t)=> t.id === a.taskId);
            if(task) task.status = a.status;
        }
    } 

    return tasks;
}