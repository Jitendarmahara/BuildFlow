import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken"
interface custompayload extends JwtPayload {
    userId: string
}
export async  function Middleware(req:Request , res:Response , next:NextFunction){
    const header = req.headers.authorization;
    const token = header?.split(" ")[1];
    if(!token){
        return res.status(401).json({
            error:"Unauthorized"
        })
    }
    try{
        const  data = jwt.verify(token , process.env.JWT_SECRET!) as  custompayload;
        if(!data.userId){
            return res.status(401).json({
                error:"Invalid token"
            })
        }
        req.userId = data.userId;
        next();
    }catch(e){
        return res.status(401).json({
            error:"Invalid token"
        })
    }
} 