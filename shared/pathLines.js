function routeKey(from, to) { return `${from}|${to}`; }

export function getSharedPathLines(map) {
  const nodes = new Map(map.paths.nodes.map((node) => [node.id, node]));
  return map.paths.edges.map(([from, to]) => {
    const route = map.paths.edgeRoutes?.[routeKey(from, to)] || map.paths.edgeRoutes?.[routeKey(to, from)];
    if (route?.length > 1) return route.map(([x, z]) => ({ x, z }));
    const a = nodes.get(from); const b = nodes.get(to);
    return a && b ? [{ x: a.x, z: a.y }, { x: b.x, z: b.y }] : [];
  }).filter((line) => line.length > 1);
}
