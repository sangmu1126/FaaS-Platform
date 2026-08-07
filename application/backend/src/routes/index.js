import express from 'express';
import multer from 'multer';
import { gatewayController } from '../controllers/gatewayController.js';
import { authController } from '../controllers/authController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() }); // In-memory for processing

router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/health', (req, res) => res.json({ status: 'OK', role: 'Smart Gateway' }));

router.use(authenticate);
router.get('/auth/me', authController.me);
router.post('/auth/logout', authController.logout);

// Functions
router.get('/functions', gatewayController.listFunctions);
router.get('/functions/:id', gatewayController.getFunctionDetail);
router.get('/functions/:id/logs', gatewayController.getFunctionLogs);
router.get('/functions/:id/metrics', gatewayController.getMetrics);
router.put('/functions/:id', gatewayController.updateFunction);
router.delete('/functions/:id', gatewayController.deleteFunction);

// Dashboard
router.get('/dashboard/stats', gatewayController.getDashboardStats);

// Actions
router.post('/upload', upload.single('file'), gatewayController.upload);
router.post('/run', gatewayController.run);
router.post('/debug/loadtest', gatewayController.startLoadTest);
router.post('/loadtest/start', gatewayController.startLoadTest);
router.post('/loadtest/stop', gatewayController.stopLoadTest);
router.get('/loadtest/status', gatewayController.getLoadTestStatus);
router.get('/status/:jobId', gatewayController.getJobStatus);

// Logs
router.get('/logs', gatewayController.getLogs);

// Health & Status
router.get('/system/status', gatewayController.getSystemStatus);
router.get('/worker/health', gatewayController.getWorkerHealth);
router.get('/metrics/prometheus', gatewayController.getPrometheusMetrics);

export default router;
