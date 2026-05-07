import api from "./axiosConfig";

export const getBatchSelectionOptions = ({ itemCode, locationCode, requiredQuantity }) =>
  api.get("/api/inventory/batches/selection-options", {
    params: { itemCode, locationCode, requiredQuantity }
  }).then(res => res.data);
