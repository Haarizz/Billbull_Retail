import { useEffect } from 'react';
import { UAE_DIRHAM_SYMBOL_IMAGE } from '../utils/countryCurrencyOptions';

const AED_TOKEN_PATTERN = /(^|[^A-Za-z0-9_])AED(?=$|[^A-Za-z0-9_])/gi;
const AMOUNT_BEFORE_AED_PATTERN = /([+-]?\d[\d,]*(?:\.\d+)?)(\s+)AED(?=$|[^A-Za-z0-9_])/gi;
const SKIPPED_SELECTOR = [
  '[data-bb-aed-symbol]',
  '[data-bb-skip-aed-symbol]',
  'script',
  'style',
  'noscript',
  'textarea',
  'input',
  'select',
  'option',
  'svg',
  'canvas',
  '[contenteditable="true"]'
].join(',');

const hasAedToken = (value) => {
  AED_TOKEN_PATTERN.lastIndex = 0;
  return AED_TOKEN_PATTERN.test(value);
};

const shouldSkipNode = (node) => {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return !element || Boolean(element.closest(SKIPPED_SELECTOR));
};

const createAedSymbolNode = () => {
  const symbol = document.createElement('span');
  symbol.className = 'bb-aed-symbol';
  symbol.dataset.bbAedSymbol = 'true';
  symbol.setAttribute('role', 'img');
  symbol.setAttribute('aria-label', 'AED');
  symbol.style.backgroundImage = `url("${UAE_DIRHAM_SYMBOL_IMAGE}")`;
  symbol.style.backgroundRepeat = 'no-repeat';
  symbol.style.backgroundPosition = 'center';
  symbol.style.backgroundSize = 'contain';
  symbol.style.display = 'inline-block';
  symbol.style.width = '1.05em';
  symbol.style.height = '0.82em';
  symbol.style.verticalAlign = '-0.08em';
  symbol.style.margin = '0 0.06em';

  return symbol;
};

const appendStandaloneAedSymbols = (text, fragment) => {
  AED_TOKEN_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match = AED_TOKEN_PATTERN.exec(text);

  while (match) {
    const prefix = match[1] || '';
    const tokenStart = match.index + prefix.length;

    if (tokenStart > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, tokenStart)));
    }

    fragment.appendChild(createAedSymbolNode());
    lastIndex = tokenStart + 3;
    match = AED_TOKEN_PATTERN.exec(text);
  }

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
};

const appendTextWithAedSymbols = (text, fragment) => {
  AMOUNT_BEFORE_AED_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match = AMOUNT_BEFORE_AED_PATTERN.exec(text);

  while (match) {
    const amount = match[1];

    if (match.index > lastIndex) {
      appendStandaloneAedSymbols(text.slice(lastIndex, match.index), fragment);
    }

    fragment.appendChild(createAedSymbolNode());
    fragment.appendChild(document.createTextNode(` ${amount}`));
    lastIndex = match.index + match[0].length;
    match = AMOUNT_BEFORE_AED_PATTERN.exec(text);
  }

  if (lastIndex < text.length) {
    appendStandaloneAedSymbols(text.slice(lastIndex), fragment);
  }
};

const replaceTextNode = (node) => {
  const text = node.nodeValue || '';
  if (!text || !hasAedToken(text) || shouldSkipNode(node)) {
    return;
  }

  const fragment = document.createDocumentFragment();
  appendTextWithAedSymbols(text, fragment);

  node.parentNode?.replaceChild(fragment, node);
};

const processNode = (node) => {
  if (node.nodeType === Node.TEXT_NODE) {
    replaceTextNode(node);
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE || shouldSkipNode(node)) {
    return;
  }

  node.normalize();

  const textNodes = [];
  const walker = document.createTreeWalker(
    node,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (textNode) => {
        if (shouldSkipNode(textNode)) {
          return NodeFilter.FILTER_REJECT;
        }

        return hasAedToken(textNode.nodeValue || '')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      }
    }
  );

  let current = walker.nextNode();
  while (current) {
    textNodes.push(current);
    current = walker.nextNode();
  }

  textNodes.forEach(replaceTextNode);
};

const AedSymbolRenderer = () => {
  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) {
      return undefined;
    }

    processNode(document.body);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData') {
          processNode(mutation.target.parentElement || mutation.target);
          return;
        }

        processNode(mutation.target);
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    return () => observer.disconnect();
  }, []);

  return null;
};

export default AedSymbolRenderer;
