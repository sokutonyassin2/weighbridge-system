const fs = require('fs');
const file = 'src/components/logistics/TransitDashboard.tsx';
let lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

console.log('Lines 925 to 935:');
lines.slice(925, 935).forEach((l, i) => {
    console.log((926 + i) + ': ' + JSON.stringify(l));
});

// Find the index of the line that has "</CommandGroup>" around 928
const idx = lines.findIndex((l, i) => i > 920 && i < 940 && l.includes('</CommandGroup>'));
if (idx !== -1) {
    console.log('Found </CommandGroup> at line', idx + 1);
    // Replace lines from idx to idx + 4
    // We want lines[idx] to be '</CommandGroup>'
    // and lines[idx+1] to be '))'
    // and remove the stray ')}' and '</div>'
    lines.splice(idx, 4, '                                                        </CommandGroup>', '                                                    ))}');
    fs.writeFileSync(file, lines.join('\r\n'), 'utf8');
    console.log('Fixed successfully!');
}
