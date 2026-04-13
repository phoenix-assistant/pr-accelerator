import pc from 'picocolors';
import type { ReviewComplexity, ReviewerRecommendation, FileCluster, AnalysisReport } from '../types/index.js';

export function printHeader(text: string): void {
  console.log('\n' + pc.bold(pc.cyan('━'.repeat(60))));
  console.log(pc.bold(pc.cyan(` ${text}`)));
  console.log(pc.bold(pc.cyan('━'.repeat(60))));
}

export function printSection(title: string): void {
  console.log('\n' + pc.bold(pc.yellow(`▸ ${title}`)));
}

export function printComplexity(c: ReviewComplexity): void {
  const colors: Record<string, (s: string) => string> = {
    trivial: pc.green,
    simple: pc.cyan,
    moderate: pc.yellow,
    complex: pc.red,
    critical: (s) => pc.bold(pc.red(s)),
  };
  const color = colors[c.level] ?? pc.white;
  printSection('Review Complexity');
  console.log(`  Level:    ${color(c.level.toUpperCase())} (score: ${c.score}/100)`);
  console.log(`  Est. time: ~${c.estimatedReviewMinutes} minutes`);
  console.log('  Factors:');
  for (const f of c.factors) {
    const bar = '█'.repeat(Math.round(f.contribution / 5));
    console.log(`    ${f.name.padEnd(25)} ${bar.padEnd(20)} +${f.contribution.toFixed(1)}`);
  }
}

export function printClusters(clusters: FileCluster[]): void {
  printSection('Semantic Diff Summary');
  for (const cluster of clusters) {
    const icon = clusterIcon(cluster.type);
    console.log(`\n  ${icon} ${pc.bold(cluster.label)}`);
    console.log(`     ${pc.green(`+${cluster.additions}`)} ${pc.red(`-${cluster.deletions}`)} across ${cluster.files.length} file(s)`);
    for (const f of cluster.files.slice(0, 5)) {
      console.log(`     ${pc.dim('  ' + f)}`);
    }
    if (cluster.files.length > 5) {
      console.log(`     ${pc.dim(`  ... and ${cluster.files.length - 5} more`)}`);
    }
  }
}

export function printRecommendations(recs: ReviewerRecommendation[]): void {
  printSection('Reviewer Recommendations');
  recs.forEach((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    console.log(`\n  ${medal} ${pc.bold(r.reviewer)}`);
    console.log(`     Score:     ${r.score.toFixed(1)}`);
    console.log(`     Open PRs:  ${r.currentLoad}`);
    console.log(`     Est. wait: ~${r.expectedWaitHours.toFixed(1)}h`);
    if (r.expertise.length > 0) {
      console.log(`     Expertise: ${r.expertise.slice(0, 3).join(', ')}`);
    }
  });
}

export function printReport(report: AnalysisReport): void {
  printHeader(`PR #${report.pr.number}: ${report.pr.title}`);
  console.log(`  Author: ${pc.bold(report.pr.author)}`);
  console.log(`  Files:  ${report.pr.changedFiles}  |  +${report.pr.additions} -${report.pr.deletions}`);

  printComplexity(report.complexity);
  printClusters(report.clusters);
  printRecommendations(report.recommendations);

  if (report.summary) {
    printSection('AI-Style Summary');
    console.log(`  ${pc.italic(report.summary)}`);
  }
  console.log('');
}

function clusterIcon(type: string): string {
  const icons: Record<string, string> = {
    test: '🧪',
    config: '⚙️',
    auth: '🔐',
    api: '🔌',
    ui: '🎨',
    docs: '📝',
    deps: '📦',
    ci: '🤖',
    core: '⚡',
    other: '📁',
  };
  return icons[type] ?? '📁';
}
