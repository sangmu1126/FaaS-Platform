import express from 'express';
import multer from 'multer';
import { gatewayController } from '../controllers/gatewayController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() }); // In-memory for processing

// Functions
router.get('/functions', gatewayController.listFunctions);
router.get('/functions/:id', gatewayController.getFunctionDetail);
// router.delete('/functions/:id', gatewayController.deleteFunction);

// Actions
router.post('/upload', upload.single('file'), gatewayController.upload);
router.post('/run', gatewayController.run);

// Logs
router.get('/logs', gatewayController.getLogs);

// Health
router.get('/health', (req, res) => res.json({ status: 'OK', role: 'Smart Gateway' }));

export default router;
