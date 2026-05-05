import { useEffect } from 'react';
import { useCompany } from '../context/CompanyContext';
import {
  resolveCurrencyDisplayConfig,
  UAE_DIRHAM_SYMBOL_IMAGE
} from '../utils/countryCurrencyOptions';

const AED_TOKEN_PATTERN = /(^|[^A-Za-z0-9_])AED(?=$|[^A-Za-z0-9_])/gi;
const AMOUNT_BEFORE_AED_PATTERN = /([+-]?\d[\d,]*(?:\.\d+)?)(\s+)AED(?=$|[^A-Za-z0-9_])/gi;
const SKIPPED_SELECTOR = [
  '[data-bb-currency-symbol]',
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

const applySymbolNodeStyles = (symbol, currencyConfig) => {
  symbol.className = 'bb-aed-symbol';
  symbol.dataset.bbCurrencySymbol = 'true';
  symbol.dataset.bbAedSymbol = 'true';
  symbol.setAttribute('role', 'img');
  symbol.setAttribute('aria-label', currencyConfig.ariaLabel);
  symbol.style.display = 'inline-block';
  symbol.style.verticalAlign = '-0.08em';
  symbol.style.margin = '0 0.06em';

  if (currencyConfig.hasImage) {
    symbol.textContent = '';
    symbol.style.backgroundColor = 'currentColor';
    symbol.style.backgroundImage = '';
    symbol.style.backgroundRepeat = '';
    symbol.style.backgroundPosition = '';
    symbol.style.backgroundSize = '';
    symbol.style.webkitMaskImage = `url("${UAE_DIRHAM_SYMBOL_IMAGE}")`;
    symbol.style.maskImage = `url("${UAE_DIRHAM_SYMBOL_IMAGE}")`;
    symbol.style.webkitMaskRepeat = 'no-repeat';
    symbol.style.maskRepeat = 'no-repeat';
    symbol.style.webkitMaskPosition = 'center';
    symbol.style.maskPosition = 'center';
    symbol.style.webkitMaskSize = 'contain';
    symbol.style.maskSize = 'contain';
    symbol.style.width = '1.05em';
    symbol.style.height = '0.82em';
    return;
  }

  symbol.textContent = currencyConfig.label;
  symbol.style.backgroundColor = '';
  symbol.style.backgroundImage = '';
  symbol.style.backgroundRepeat = '';
  symbol.style.backgroundPosition = '';
  symbol.style.backgroundSize = '';
  symbol.style.webkitMaskImage = '';
  symbol.style.maskImage = '';
  symbol.style.webkitMaskRepeat = '';
  symbol.style.maskRepeat = '';
  symbol.style.webkitMaskPosition = '';
  symbol.style.maskPosition = '';
  symbol.style.webkitMaskSize = '';
  symbol.style.maskSize = '';
  symbol.style.width = 'auto';
  symbol.style.height = 'auto';
};

const createCurrencySymbolNode = (currencyConfig) => {
  const symbol = document.createElement('span');
  applySymbolNodeStyles(symbol, currencyConfig);
  return symbol;
};

const updateExistingCurrencySymbolNodes = (currencyConfig) => {
  document
    .querySelectorAll('[data-bb-currency-symbol], [data-bb-aed-symbol]')
    .forEach((symbol) => applySymbolNodeStyles(symbol, currencyConfig));
};

const appendStandaloneAedSymbols = (text, fragment, currencyConfig) => {
  AED_TOKEN_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match = AED_TOKEN_PATTERN.exec(text);

  while (match) {
    const prefix = match[1] || '';
    const tokenStart = match.index + prefix.length;

    if (tokenStart > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, tokenStart)));
    }

    fragment.appendChild(createCurrencySymbolNode(currencyConfig));
    lastIndex = tokenStart + 3;
    match = AED_TOKEN_PATTERN.exec(text);
  }

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
};

const appendTextWithAedSymbols = (text, fragment, currencyConfig) => {
  AMOUNT_BEFORE_AED_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match = AMOUNT_BEFORE_AED_PATTERN.exec(text);

  while (match) {
    const amount = match[1];

    if (match.index > lastIndex) {
      appendStandaloneAedSymbols(text.slice(lastIndex, match.index), fragment, currencyConfig);
    }

    fragment.appendChild(createCurrencySymbolNode(currencyConfig));
    fragment.appendChild(document.createTextNode(` ${amount}`));
    lastIndex = match.index + match[0].length;
    match = AMOUNT_BEFORE_AED_PATTERN.exec(text);
  }

  if (lastIndex < text.length) {
    appendStandaloneAedSymbols(text.slice(lastIndex), fragment, currencyConfig);
  }
};

const replaceTextNode = (node, currencyConfig) => {
  const text = node.nodeValue || '';
  if (!text || !hasAedToken(text) || shouldSkipNode(node)) {
    return;
  }

  const fragment = document.createDocumentFragment();
  appendTextWithAedSymbols(text, fragment, currencyConfig);

  node.parentNode?.replaceChild(fragment, node);
};

const processNode = (node, currencyConfig) => {
  if (node.nodeType === Node.TEXT_NODE) {
    replaceTextNode(node, currencyConfig);
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE || shouldSkipNode(node)) {
    return;
  }

  if (!hasAedToken(node.textContent || '')) {
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

  textNodes.forEach((textNode) => replaceTextNode(textNode, currencyConfig));
};

const AedSymbolRenderer = () => {
  const { company } = useCompany();
  const currencyConfig = resolveCurrencyDisplayConfig(company || {});

  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) {
      return undefined;
    }

    updateExistingCurrencySymbolNodes(currencyConfig);

    if (!currencyConfig.hasImage) {
      return undefined;
    }

    processNode(document.body, currencyConfig);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData') {
          processNode(mutation.target.parentElement || mutation.target, currencyConfig);
          return;
        }

        processNode(mutation.target, currencyConfig);
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    return () => observer.disconnect();
  }, [currencyConfig.ariaLabel, currencyConfig.hasImage, currencyConfig.label]);

  return null;
};

export default AedSymbolRenderer;
