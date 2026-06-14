import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";

export interface UploadedFile {
  id: string;
  originalName: string;
  filePath: string;
  sheetNames: string[];
  detectedMonths: string[];
}

export interface DeleteRowConfig {
  rowNumber: number;
}

export interface ModifyRowConfig {
  rowNumber: number;
  plusMinus: "+" | "-";
  hoursAdjustment: number;
  efteAdjustment: number;
  divisor: number;
}

export type SessionStatus = "empty" | "uploaded" | "configured" | "exported";

export interface Session {
  id: string;
  files: UploadedFile[];
  selectedMonth: string | null;
  deleteRows: DeleteRowConfig[];
  modifyRows: ModifyRowConfig[];
  status: SessionStatus;
  exportedFilePath?: string;
}

const sessions = new Map<string, Session>();

export function createSession(): Session {
  const session: Session = {
    id: uuidv4(),
    files: [],
    selectedMonth: null,
    deleteRows: [],
    modifyRows: [],
    status: "empty",
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function updateSession(id: string, updates: Partial<Session>): Session | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  const updated = { ...session, ...updates };
  sessions.set(id, updated);
  return updated;
}

export function deleteSession(id: string): void {
  const session = sessions.get(id);
  if (session) {
    for (const file of session.files) {
      try { fs.unlinkSync(file.filePath); } catch {}
    }
    if (session.exportedFilePath) {
      try { fs.unlinkSync(session.exportedFilePath); } catch {}
    }
    sessions.delete(id);
  }
}

export function getWorkspaceRoot(): string {
  const cwd = process.cwd();
  return cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
}

export function getUploadsDir(): string {
  const uploadsDir = path.resolve(getWorkspaceRoot(), "artifacts/api-server/uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  return uploadsDir;
}
