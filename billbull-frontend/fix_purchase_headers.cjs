const fs = require('fs');
const path = require('path');

const walkSync = (dir, filelist = []) => {
    fs.readdirSync(dir).forEach(file => {
        const filepath = path.join(dir, file);
        if (fs.statSync(filepath).isDirectory()) {
            filelist = walkSync(filepath, filelist);
        } else if (file.endsWith('.jsx')) {
            filelist.push(filepath);
        }
    });
    return filelist;
};

const purchaseDir = 'c:/Users/harik/Desktop/Billbull_Retail/billbull-frontend/src/pages/Purchase';
const files = walkSync(purchaseDir);

let changed = 0;
files.forEach(f => {
    const content = fs.readFileSync(f, 'utf8');
    const regex = /buildDocumentHeaderProfile\(\{\s*company\s*,[^}]+\}\)/g;
    if (regex.test(content)) {
        const newContent = content.replace(regex, 'company');
        fs.writeFileSync(f, newContent, 'utf8');
        console.log('Modified:', f);
        changed++;
    }
});
console.log('Total files modified:', changed);
