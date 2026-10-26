import AppError from '../utils/AppError.js'

export const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    if (!schema) return next()

    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    })

    if (error) {
      const errorDetails = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/['"]/g, ''),
      }))
      return next(new AppError('Validation Error', 400, errorDetails))
    }

    req[source] = value
    next()
  }
}

export default validate
