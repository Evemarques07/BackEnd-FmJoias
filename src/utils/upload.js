const multer = require('multer')
const path = require('path')

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../public/images'))
  },
  filename: (req, file, cb) => {
    const idUser = req.user?.id
    const ext = path.extname(file.originalname).toLowerCase() // .jpg, .png
    cb(null, `${idUser}${ext}`)
  },
})

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/jpg']
  if (allowed.includes(file.mimetype)) cb(null, true)
  else cb(new Error('Formato de imagem inválido.'))
}

module.exports = multer({ storage, fileFilter })
