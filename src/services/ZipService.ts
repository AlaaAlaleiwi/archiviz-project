import JSZip from "jszip";
import { saveAs } from "file-saver";

export type GeneratedFile = {
  path: string;
  content: string;
};

export class ZipService {
  async download(files: GeneratedFile[], projectName: string) {
    const zip = new JSZip();

    files.forEach(file => {
      zip.file(file.path, file.content);
    });

    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `${projectName || "project"}.zip`);
  }
}