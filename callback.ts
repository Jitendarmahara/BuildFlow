function great(callback:()=>void){
    console.log("hi");
    callback()
}

function bye(){
    console.log("hello")
}

great(bye);