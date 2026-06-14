import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  createSession,
  getSession,
  updateSession,
  getUploadsDir,
  type DeleteRowConfig,
  type ModifyRowConfig,
} from "../../lib/sessionStore.js";
import { analyzeExcelFile, previewChanges, buildMasterExcel } from "../../lib/excelProcessor.js";
import {
  GetSessionParams,
  UpdateSessionParams,
  UpdateSessionBody,
  UploadFilesParams,
  PreviewChangesParams,
  ExportSessionParams,
  DownloadSessionParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, getUploadsDir());
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = [".xlsx", ".xls", ".ods"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only .xlsx, .xls, .ods files are allowed"));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
});

function serializeSession(session: ReturnType<typeof getSession>) {
  if (!session) return null;
  return {
    id: session.id,
    files: session.files.map((f) => ({
      id: f.id,
      originalName: f.originalName,
      sheetNames: f.sheetNames,
      detectedMonths: f.detectedMonths,
    })),
    selectedMonth: session.selectedMonth,
    deleteRows: session.deleteRows,
    modifyRows: session.modifyRows,
    status: session.status,
  };
}

// POST /sessions
router.post("/sessions", async (_req, res): Promise<void> => {
  const session = createSession();
  res.status(201).json(serializeSession(session));
});

// GET /sessions/:sessionId
router.get("/sessions/:sessionId", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const session = getSession(params.data.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json(serializeSession(session));
});

// PATCH /sessions/:sessionId
router.patch("/sessions/:sessionId", async (req, res): Promise<void> => {
  const params = UpdateSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const session = getSession(params.data.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const body = UpdateSessionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updates: Partial<typeof session> = {};
  if (body.data.selectedMonth !== undefined) updates.selectedMonth = body.data.selectedMonth;
  if (body.data.deleteRows !== undefined) updates.deleteRows = body.data.deleteRows as DeleteRowConfig[];
  if (body.data.modifyRows !== undefined) updates.modifyRows = body.data.modifyRows as ModifyRowConfig[];

  const hasFiles = session.files.length > 0;
  const hasMonth = (updates.selectedMonth ?? session.selectedMonth) !== null;
  if (hasFiles && hasMonth) {
    updates.status = "configured";
  }

  const updated = updateSession(params.data.sessionId, updates);
  res.json(serializeSession(updated));
});

// POST /sessions/:sessionId/upload
router.post(
  "/sessions/:sessionId/upload",
  upload.array("files"),
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
    const params = UploadFilesParams.safeParse({ sessionId: raw });
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const session = getSession(params.data.sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const uploadedFiles = req.files as Express.Multer.File[];
    if (!uploadedFiles || uploadedFiles.length === 0) {
      res.status(400).json({ error: "No files uploaded" });
      return;
    }

    const { v4: uuidv4 } = await import("uuid");
    const newFiles = [...session.files];

    for (const file of uploadedFiles) {
      try {
        const analysis = await analyzeExcelFile(file.path);
        newFiles.push({
          id: uuidv4(),
          originalName: file.originalname,
          filePath: file.path,
          sheetNames: analysis.sheetNames,
          detectedMonths: analysis.detectedMonths,
        });
      } catch (err) {
        req.log.error({ err, filename: file.originalname }, "Failed to analyze Excel file");
        try { fs.unlinkSync(file.path); } catch {}
      }
    }

    const updated = updateSession(params.data.sessionId, {
      files: newFiles,
      status: newFiles.length > 0 ? "uploaded" : "empty",
    });

    res.json(serializeSession(updated));
  },
);

// POST /sessions/:sessionId/preview
router.post("/sessions/:sessionId/preview", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const params = PreviewChangesParams.safeParse({ sessionId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const session = getSession(params.data.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (!session.selectedMonth) {
    res.status(400).json({ error: "No month selected" });
    return;
  }

  if (session.files.length === 0) {
    res.status(400).json({ error: "No files uploaded" });
    return;
  }

  const result = await previewChanges(
    session.files,
    session.selectedMonth,
    session.deleteRows,
    session.modifyRows,
  );

  res.json(result);
});

// POST /sessions/:sessionId/export
router.post("/sessions/:sessionId/export", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const params = ExportSessionParams.safeParse({ sessionId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const session = getSession(params.data.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (!session.selectedMonth) {
    res.status(400).json({ error: "No month selected" });
    return;
  }

  if (session.files.length === 0) {
    res.status(400).json({ error: "No files uploaded" });
    return;
  }

  const { getUploadsDir } = await import("../../lib/sessionStore.js");
  const outputFilename = `Master_Cluster_Austria_EFTE_${session.selectedMonth}.xlsx`;
  const outputPath = path.join(getUploadsDir(), `${params.data.sessionId}-master.xlsx`);

  await buildMasterExcel(
    session.files,
    session.selectedMonth,
    session.deleteRows,
    session.modifyRows,
    outputPath,
  );

  updateSession(params.data.sessionId, {
    status: "exported",
    exportedFilePath: outputPath,
  });

  const downloadUrl = `/api/sessions/${params.data.sessionId}/download`;
  res.json({ downloadUrl, filename: outputFilename });
});

// GET /sessions/:sessionId/download
router.get("/sessions/:sessionId/download", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const params = DownloadSessionParams.safeParse({ sessionId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const session = getSession(params.data.sessionId);
  if (!session || !session.exportedFilePath) {
    res.status(404).json({ error: "Export not found. Please run export first." });
    return;
  }

  if (!fs.existsSync(session.exportedFilePath)) {
    res.status(404).json({ error: "Export file not found on disk" });
    return;
  }

  const filename = `Master_Cluster_Austria_EFTE_${session.selectedMonth ?? "export"}.xlsx`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.sendFile(session.exportedFilePath);
});

export default router;
