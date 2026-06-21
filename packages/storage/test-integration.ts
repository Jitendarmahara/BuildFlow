import {client} from "@repo/db/client";
import {Awsclient} from "./index.ts"

const user = await client.user.create({
    data:{email:"test@example.com" , password :"hello"}
})

const project = await client.project.create({
    data:{title:"My Test Project" , userId: user.id}
})
//
const path = "src/App.jsx";
const s3Key = `projects/${project.id}/${path}`;
await Awsclient.write(s3Key , "export default function App(){return <div> hi </div>}");

const readback = await Awsclient.file(s3Key).text();
console.log(readback);

const file = await client.file.create({
    data: {projectId : project.id , path ,s3Key}
})

console.log(file)