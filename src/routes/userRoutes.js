// userRoutes.js
const express = require('express')
const { body } = require('express-validator')
const router = express.Router()
const userController = require('../controllers/userController')
const {
  authenticateToken,
  authenticateAdminToken,
} = require('../middleware/auth')
const upload = require('../utils/upload')

router.post(
  '/register',
  body('fullName').notEmpty().withMessage('Nome completo é obrigatório'),
  body('cpf')
    .isLength({ min: 11, max: 11 })
    .withMessage('CPF deve ter 11 caracteres'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Senha deve ter no mínimo 6 caracteres'),
  userController.register
)

router.post('/registerUserMestre', userController.registerMasterUser)
router.post(
  '/register-admin',
  body('name').notEmpty().withMessage('Nome completo é obrigatório'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Senha deve ter no mínimo 6 caracteres'),
  body('cpf')
    .notEmpty()
    .withMessage('CPF é obrigatório')
    .isLength({ min: 11, max: 14 })
    .withMessage('CPF deve ter entre 11 e 14 caracteres'),
  userController.createAdminUser
)

router.post(
  '/loginApp',
  body('cpf')
    .isLength({ min: 11, max: 11 })
    .withMessage('CPF deve ter 11 caracteres'),
  body('password').notEmpty().withMessage('Senha é obrigatória'),
  userController.login
)
router.post('/loginMestre', userController.loginMasterUser)
router.put(
  '/change-password-mestre',
  authenticateToken,
  userController.changeMasterUserPassword
)
router.post(
  '/login-admin',
  body('fullName').notEmpty().withMessage('Nome completo é obrigatório'),
  body('password').notEmpty().withMessage('Senha é obrigatória'),
  userController.loginAdminUser
)

router.post(
  '/admin/change-name',
  authenticateToken,
  userController.editAdminName
)
router.post(
  '/admin/change-password',
  authenticateToken,
  userController.changeAdminPassword
)

router.get('/profile', authenticateToken, userController.getProfile)

router.post(
  '/check-authorization',
  body('cpf')
    .isLength({ min: 11, max: 11 })
    .withMessage('CPF deve ter 11 caracteres'),
  userController.checkAuthorization
)

router.post('/edit-name', authenticateToken, userController.editName)

router.post('/results', authenticateToken, userController.getResultsByRoute)

router.put(
  '/change-password',
  body('currentPassword').notEmpty().withMessage('Senha atual é obrigatória'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('Nova senha deve ter no mínimo 6 caracteres'),
  authenticateToken,
  userController.changePassword
)

router.get(
  '/ranking-novatas',
  authenticateToken,
  userController.getRankingVendedores
)
router.get(
  '/ranking-medias',
  authenticateToken,
  userController.getMediaValorRecebidoRanking
)

router.get('/ativos', userController.getVendedor)

router.post(
  '/upload-imagem',
  authenticateToken,
  upload.single('imagem'),
  userController.uploadProfileImage
)

router.get('/imagem', authenticateToken, userController.getProfileImage)
router.delete('/imagem', authenticateToken, userController.deleteProfileImage)
router.get(
  '/gerenciamento/listar-usuarios',
  authenticateAdminToken,
  userController.listarUsuarios
)
router.delete(
  '/gerenciamento/deletar-usuario/:id',
  authenticateAdminToken,
  userController.deletarUsuario
)
router.post(
  '/admin/autorizados',
  authenticateAdminToken,
  userController.cadastrarAutorizado
)
router.get(
  '/admin/autorizados',
  authenticateAdminToken,
  userController.listarAutorizados
)
router.patch(
  '/admin/autorizados/:id',
  authenticateAdminToken,
  userController.atualizarCargoAutorizado
)
router.delete(
  '/admin/autorizados/:id',
  authenticateAdminToken,
  userController.deletarAutorizado
)
router.get('/admin/listar', authenticateAdminToken, userController.listarAdmins)
router.delete('/admin/:id', authenticateAdminToken, userController.deletarAdmin)

router.get(
  '/buscar-usuario/:idVendedor',
  authenticateAdminToken,
  userController.getUsersByIdVendedor
)

router.get(
  '/gerenciamento/buscar-usuario-autorizad/:id',
  authenticateAdminToken,
  userController.getUersAuthorizedAdminId
)

router.get(
  '/gerenciamento/buscar-usuario-adm/:id',
  authenticateAdminToken,
  userController.getUserAdminById
)

module.exports = router
