import api from "./axiosConfig";

// --------------------
// GET ALL
// --------------------
export const getBarcodeTemplates = async () => {
    const res = await api.get("/api/barcode-templates");
    return res.data;
};

// --------------------
// CREATE
// --------------------
export const createBarcodeTemplate = async (template) => {
    const res = await api.post("/api/barcode-templates", template);
    return res.data;
};

// --------------------
// UPDATE
// --------------------
export const updateBarcodeTemplate = async (id, template) => {
    const res = await api.put(`/api/barcode-templates/${id}`, template);
    return res.data;
};

// --------------------
// DELETE
// --------------------
export const deleteBarcodeTemplate = async (id) => {
    await api.delete(`/api/barcode-templates/${id}`);
};
