import api from "@billbull/shared/api/axiosConfig";

export const getBatchSelectionOptions = ({ itemCode, locationCode, binId, requiredQuantity }) =>
  api.get("/api/inventory/batches/selection-options", {
    params: { itemCode, locationCode, binId, requiredQuantity }
  }).then(res => res.data);
