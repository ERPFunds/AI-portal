export interface SaveFileOnlyOutput {
  summary: string;
  brief: string;
  outputType: "filed";
}

export async function runSaveFileOnly(params: {
  ask: string;
  projectContext: string;
  attachments?: Array<{ filename: string; contentType: string; contentBase64: string }>;
}): Promise<SaveFileOnlyOutput> {
  const fileCount = params.attachments?.length ?? 0;
  const fileList =
    fileCount > 0
      ? params.attachments!.map((a) => `  • ${a.filename} (${a.contentType})`).join("\n")
      : "  • No attachments (email body filed as note)";

  const brief = `Filed to knowledge base.
Project: ${params.projectContext}
Note: ${params.ask}
Files:
${fileList}
Filed at: ${new Date().toISOString()}`;

  const summary =
    fileCount > 0
      ? `${fileCount} file${fileCount > 1 ? "s" : ""} filed to ${params.projectContext} KB.`
      : `Note filed to ${params.projectContext} KB.`;

  return { summary, brief, outputType: "filed" };
}
