class ApiError extends Error{
    constructor(
        statusCode,
        message = "Something went wrong",
        errors = [],
        stack = "",
        code = undefined
    ){
        super(message)
        this.statusCode = statusCode
        this.data = null
        this.message = message
        this.success = false
        this.errors = errors
        if (code) this.code = code

        if(stack){
            this.stack = stack
        } else {
            Error.captureStackTrace(this,this.constructor)
        }
    }
}

export {ApiError};
