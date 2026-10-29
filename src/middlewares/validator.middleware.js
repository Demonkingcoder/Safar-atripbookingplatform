import { validationResult } from "express-validator";
import { ApiError } from "../utils/api-error.js";

const validate = (req,res,next)=>{
    const errors = validationResult(req);
    if(errors.isEmpty()){
        return next();
    }
    const extractedErrors = [];
    errors.array().map((err)=>
        extractedErrors.push({
            [err.path]:err.msg,
        }),
    )
    throw new ApiError(422,"Received data is invalid.",extractedErrors);
};

export { validate }