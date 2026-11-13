import fs from "node:fs";

const path = "src/processLibrary.tsx";
let source = fs.readFileSync(path,"utf8");
const marker = "// process-activation-v86";
if (!source.includes(marker)) {
  if (!source.includes("// process-file-management-v85")) throw Error("Process Activation v86 requires management v85");
  function once(from,to,label) {
    if (source.split(from).length!==2) throw Error("Process Activation v86 anchor "+label);
    source=source.replace(from,to);
  }
  once('import { collection, doc, getDoc, getDocs, getFirestore, onSnapshot, writeBatch } from "firebase/firestore";',
       'import { collection, doc, getDoc, getDocs, getFirestore, onSnapshot, query, where, writeBatch } from "firebase/firestore";',
       "Firestore filtered metadata imports");
  once('// process-file-management-v85', '// process-file-management-v85\n'+marker,"marker");
  once('  const managerPreviewItemsV85 = managerPreviewFileV85',
`  // Activating a version is different from Restore: Restore only unhides.
  // Use a single atomic metadata batch; leave all file chunks and historical
  // case-to-version references untouched.
  const activateProcessFileV86 = async (item: ProcessVersion) => {
    if (!processManageAllowedV85 || managerBusyIdV85 || !item.id) return;
    const services = firebaseServices();
    if (!services) { setManagerMessageV85("ยังเชื่อมต่อฐานข้อมูล Process ไม่สำเร็จ"); return; }
    setManagerBusyIdV85(item.id);
    setManagerMessageV85("");
    try {
      const sameName = await getDocs(query(
        collection(services.db, PROCESS_COLLECTION),
        where("name","==",item.name)
      ));
      const batch = writeBatch(services.db);
      sameName.docs.forEach(entry => {
        if (entry.id !== item.id && entry.data()?.status === "current")
          batch.set(entry.ref,{status:"archived"},{merge:true});
      });
      batch.set(doc(services.db, PROCESS_COLLECTION, item.id),{
        status:"current",hiddenFromPicker:false,removedAt:"",removedBy:""
      },{merge:true});
      await batch.commit();
      setSelectedProcessIdV84(item.id);
      setManagerMessageV85("ตั้ง " + item.fileName + " เป็น Current สำเร็จ · เก็บข้อมูลเคสเดิมไว้");
    } catch(error) {
      console.error("Activate Process file failed",error);
      const code = String((error as any)?.code || "");
      setManagerMessageV85(code.includes("resource-exhausted")
        ? "Firestore ถึงขีดจำกัดการอ่าน/เขียน กรุณาลองใหม่เมื่อโควต้าพร้อม"
        : code.includes("permission-denied")
          ? "บัญชีนี้ไม่มีสิทธิ์เปลี่ยน Process ปัจจุบัน"
          : "เปลี่ยน Process ปัจจุบันไม่สำเร็จ: " + (error instanceof Error ? error.message : code || "unknown"));
    } finally { setManagerBusyIdV85(""); }
  };
  const managerPreviewItemsV85 = managerPreviewFileV85`, "activation handler");
  once('          onChangeVisibility={(file, hidden) => { void setFileHiddenV85(file, hidden); }}',
       '          onChangeVisibility={(file, hidden) => { void setFileHiddenV85(file, hidden); }}\n          onActivateCurrent={(file) => { void activateProcessFileV86(file); }}',
       "manager activation callback");
  // Only fetch metadata from versions with the same name. Reading every file
  // chunk on each upload was expensive and could exhaust Firestore quota.
  once('const existing = await getDocs(collection(services.db, PROCESS_COLLECTION));',
       'const existing = await getDocs(query(collection(services.db, PROCESS_COLLECTION),where("name","==",processName)));',
       "upload query filters out file chunks");
  fs.writeFileSync(path,source);
  console.log("Applied Process activation v86: filtered upload metadata read, explicit Activate Current");
} else {
  console.log("Process activation v86 already applied");
}
