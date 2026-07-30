import React from 'react';
import { Box } from 'lucide-react';
import { getImageUrl } from '../../../utils/urlUtils';

const ProductCard = ({ product }) => {
    if (!product) return null;

    return (
        <div className="flex items-start gap-4 p-4 border border-border rounded-lg bg-muted/30 mb-4">
            <div className="w-16 h-16 rounded-lg border border-border bg-background flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                {product.image ? (
                    <img src={getImageUrl(product.image)} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                    <Box size={24} className="text-muted-foreground opacity-50" />
                )}
            </div>
            
            <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-foreground mb-1 leading-tight line-clamp-2">
                    {product.name || product.desc}
                </h3>
                
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {product.code && (
                        <div className="flex items-center gap-1">
                            <span className="font-semibold text-foreground/80">SKU:</span>
                            <span>{product.code}</span>
                        </div>
                    )}
                    {product.barcode && (
                        <div className="flex items-center gap-1">
                            <span className="font-semibold text-foreground/80">Barcode:</span>
                            <span className="font-mono tracking-tight">{product.barcode}</span>
                        </div>
                    )}
                    {product.unit && (
                        <div className="flex items-center gap-1">
                            <span className="font-semibold text-foreground/80">UOM:</span>
                            <span>{product.unit}</span>
                        </div>
                    )}
                    {product.brandName && (
                        <div className="flex items-center gap-1">
                            <span className="font-semibold text-foreground/80">Brand:</span>
                            <span>{product.brandName}</span>
                        </div>
                    )}
                    {product.categoryName && (
                        <div className="flex items-center gap-1">
                            <span className="font-semibold text-foreground/80">Category:</span>
                            <span>{product.categoryName}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProductCard;
