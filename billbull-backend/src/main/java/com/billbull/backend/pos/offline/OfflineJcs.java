package com.billbull.backend.pos.offline;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * RFC 8785 (JSON Canonicalization Scheme) for the subset of JSON an offline record may contain:
 * objects, arrays, strings, booleans, null and <b>integers</b>.
 *
 * <p>Offline records carry every amount in integer minor units and every rate in basis points, so
 * no floating-point number is ever signed. That removes the one part of JCS that is hard to
 * reproduce byte for byte across languages (ECMAScript number serialisation). A non-integral
 * number, or an integer outside the IEEE-754 safe range, is refused rather than canonicalised.
 *
 * <p>Must stay byte-identical with {@code packages/shared/src/pages/Sales/POS/offline/jcs.js}; the
 * shared vectors in {@code src/test/resources/pos-offline/jcs-vectors.json} prove it.
 *
 * <ul>
 *   <li>Object members are sorted by their keys as UTF-16 code-unit sequences ({@link String#compareTo}
 *       is exactly that order).</li>
 *   <li>Strings are written as {@code JSON.stringify} writes them: {@code "} and {@code \} escaped,
 *       U+0008/9/A/C/D as {@code \b \t \n \f \r}, other controls below U+0020 as a lowercase
 *       six-character hex escape, everything else literally (including non-ASCII and U+2028/9). Lone
 *       surrogates are refused.</li>
 *   <li>No whitespace.</li>
 * </ul>
 */
public final class OfflineJcs {

    /** 2^53 - 1: the largest integer both JavaScript and Java represent exactly. */
    static final long MAX_SAFE_INTEGER = 9007199254740991L;

    private OfflineJcs() {}

    public static byte[] canonicalBytes(JsonNode node) {
        return canonicalize(node).getBytes(StandardCharsets.UTF_8);
    }

    public static String canonicalize(JsonNode node) {
        StringBuilder out = new StringBuilder(256);
        write(node, out);
        return out.toString();
    }

    private static void write(JsonNode node, StringBuilder out) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            out.append("null");
        } else if (node.isObject()) {
            List<Map.Entry<String, JsonNode>> fields = new ArrayList<>();
            Iterator<Map.Entry<String, JsonNode>> it = node.fields();
            while (it.hasNext()) fields.add(it.next());
            fields.sort(Map.Entry.comparingByKey());
            out.append('{');
            for (int i = 0; i < fields.size(); i++) {
                if (i > 0) out.append(',');
                writeString(fields.get(i).getKey(), out);
                out.append(':');
                write(fields.get(i).getValue(), out);
            }
            out.append('}');
        } else if (node.isArray()) {
            out.append('[');
            for (int i = 0; i < node.size(); i++) {
                if (i > 0) out.append(',');
                write(node.get(i), out);
            }
            out.append(']');
        } else if (node.isTextual()) {
            writeString(node.textValue(), out);
        } else if (node.isBoolean()) {
            out.append(node.booleanValue() ? "true" : "false");
        } else if (node.isIntegralNumber()) {
            if (!node.canConvertToLong() || Math.abs(node.longValue()) > MAX_SAFE_INTEGER) {
                throw new IllegalArgumentException("Integer outside the safe range: " + node.asText());
            }
            out.append(node.longValue());
        } else if (node.isNumber()) {
            // A JSON "1.0" parses as a floating node; JavaScript would print it as 1. Refuse all
            // floating nodes instead, so a record either canonicalises identically or not at all.
            throw new IllegalArgumentException("Offline records carry integers only, got " + node.asText());
        } else {
            throw new IllegalArgumentException("Unsupported JSON node: " + node.getNodeType());
        }
    }

    private static void writeString(String s, StringBuilder out) {
        out.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (Character.isHighSurrogate(c)) {
                if (i + 1 >= s.length() || !Character.isLowSurrogate(s.charAt(i + 1))) {
                    throw new IllegalArgumentException("Lone surrogate in string");
                }
                out.append(c).append(s.charAt(++i));
                continue;
            }
            if (Character.isLowSurrogate(c)) throw new IllegalArgumentException("Lone surrogate in string");
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\b' -> out.append("\\b");
                case '\t' -> out.append("\\t");
                case '\n' -> out.append("\\n");
                case '\f' -> out.append("\\f");
                case '\r' -> out.append("\\r");
                default -> {
                    if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
                    else out.append(c);
                }
            }
        }
        out.append('"');
    }
}
