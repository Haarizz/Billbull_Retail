import React, { createContext, useContext, useMemo, useState } from "react";

export function cn(...classes) {
    return classes.filter(Boolean).join(" ");
}

const buttonBase = "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus:outline-none disabled:pointer-events-none disabled:opacity-50";
const buttonVariants = {
    default: "bg-slate-900 text-white hover:bg-slate-800",
    outline: "border border-gray-300 bg-white text-slate-700 hover:bg-gray-50",
    ghost: "text-slate-700 hover:bg-slate-100",
    destructive: "bg-red-600 text-white hover:bg-red-700",
};
const buttonSizes = {
    default: "h-10 px-4 py-2",
    sm: "h-8 px-3 text-xs",
    lg: "h-11 px-6",
    icon: "h-9 w-9",
};

export const Button = React.forwardRef(({ className = "", variant = "default", size = "default", type = "button", ...props }, ref) => (
    <button
        ref={ref}
        type={type}
        className={cn(buttonBase, buttonVariants[variant] || buttonVariants.default, buttonSizes[size] || buttonSizes.default, className)}
        {...props}
    />
));
Button.displayName = "Button";

export function Badge({ className = "", variant = "default", ...props }) {
    const variantClass = variant === "outline"
        ? "border border-gray-300 bg-white text-slate-700"
        : "bg-slate-900 text-white";
    return (
        <span
            className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium", variantClass, className)}
            {...props}
        />
    );
}

export function Card({ className = "", ...props }) {
    return <div className={cn("rounded-lg bg-white shadow-md border-0 ring-1 ring-black/5", className)} {...props} />;
}

export function CardHeader({ className = "", ...props }) {
    return <div className={cn("p-6 pb-3", className)} {...props} />;
}

export function CardContent({ className = "", ...props }) {
    return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function CardTitle({ className = "", ...props }) {
    return <h3 className={cn("text-lg font-semibold text-slate-900", className)} {...props} />;
}

export function CardDescription({ className = "", ...props }) {
    return <p className={cn("text-sm text-slate-500", className)} {...props} />;
}

const inputClass = "flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#F5C742] focus:outline-none";

export const Input = React.forwardRef(({ className = "", ...props }, ref) => (
    <input ref={ref} className={cn(inputClass, className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef(({ className = "", ...props }, ref) => (
    <textarea
        ref={ref}
        className={cn("min-h-24 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#F5C742] focus:outline-none", className)}
        {...props}
    />
));
Textarea.displayName = "Textarea";

export function Label({ className = "", ...props }) {
    return <label className={cn("text-sm font-medium text-slate-700", className)} {...props} />;
}

export function Switch({ checked, onCheckedChange, className = "" }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={!!checked}
            onClick={() => onCheckedChange?.(!checked)}
            className={cn("relative inline-flex h-5 w-9 shrink-0 items-center overflow-hidden rounded-full transition-colors", checked ? "bg-[#F5C742]" : "bg-gray-300", className)}
        >
            <span className={cn("block h-4 w-4 shrink-0 rounded-full bg-white shadow transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} />
        </button>
    );
}

export function Separator({ className = "" }) {
    return <div className={cn("h-px w-full bg-gray-200", className)} />;
}

export function ScrollArea({ className = "", ...props }) {
    return <div className={cn("overflow-auto", className)} {...props} />;
}

const TabsContext = createContext(null);

export function Tabs({ defaultValue, value, onValueChange, className = "", children }) {
    const [internalValue, setInternalValue] = useState(defaultValue);
    const activeValue = value ?? internalValue;
    const setActiveValue = (next) => {
        setInternalValue(next);
        onValueChange?.(next);
    };

    return (
        <TabsContext.Provider value={{ activeValue, setActiveValue }}>
            <div className={className}>{children}</div>
        </TabsContext.Provider>
    );
}

export function TabsList({ className = "", ...props }) {
    return <div className={cn("inline-flex rounded-lg bg-slate-100 p-1", className)} {...props} />;
}

export function TabsTrigger({ value, className = "", children }) {
    const ctx = useContext(TabsContext);
    const active = ctx?.activeValue === value;
    return (
        <button
            type="button"
            onClick={() => ctx?.setActiveValue(value)}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900", className)}
        >
            {children}
        </button>
    );
}

export function TabsContent({ value, className = "", children }) {
    const ctx = useContext(TabsContext);
    const isActive = ctx?.activeValue === value;
    return (
        <div className={className} style={isActive ? undefined : { display: "none" }}>
            {children}
        </div>
    );
}

const SelectContext = createContext(null);

const getNodeText = (node) => {
    if (node === null || node === undefined || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(getNodeText).join("");
    if (React.isValidElement(node)) return getNodeText(node.props.children);
    return "";
};

const collectSelectItems = (children, items = []) => {
    React.Children.forEach(children, (child) => {
        if (!React.isValidElement(child)) return;
        if (child.type?.displayName === "SelectItem") {
            items.push({
                value: child.props.value,
                label: getNodeText(child.props.children) || child.props.value,
            });
            return;
        }
        collectSelectItems(child.props.children, items);
    });
    return items;
};

export function Select({ value, onValueChange, children }) {
    const items = useMemo(() => collectSelectItems(children), [children]);
    return (
        <SelectContext.Provider value={{ value, onValueChange, items }}>
            {children}
        </SelectContext.Provider>
    );
}

export function SelectTrigger({ className = "" }) {
    const ctx = useContext(SelectContext);
    return (
        <select
            value={ctx?.value ?? ""}
            onChange={(event) => ctx?.onValueChange?.(event.target.value)}
            className={cn(inputClass, className)}
        >
            {(ctx?.items || []).map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
            ))}
        </select>
    );
}

export function SelectValue() {
    return null;
}

export function SelectContent() {
    return null;
}

export function SelectItem() {
    return null;
}
SelectItem.displayName = "SelectItem";
