// Граф связей: раскладка и отрисовка
// Часть family_tree_tool GUI. Общий глобальный скоуп (см. index.html — файлы грузятся по порядку).

// Переключатель раскладки ОБЗОРНОГО графа: true — dagre (новая), false — старая самописная.
// Оставлено флагом, чтобы сравнить обе и мгновенно откатиться. Граф одной карточки не затронут.
const USE_DAGRE_OVERVIEW = true;
// const USE_DAGRE_OVERVIEW = false;

function graphNodeMeta(node) {
  if (node.card_type === "person") {
    return node.birth_date || "Н/д";
  }
  return "Группа";
}

function centeredRowPositions(ids, y, width, nodeWidth, gap, padding) {
  if (!ids.length) {
    return [];
  }
  const rowWidth = ids.length * nodeWidth + Math.max(0, ids.length - 1) * gap;
  let startX = Math.round((width - rowWidth) / 2);
  if (startX < padding) {
    startX = padding;
  }
  return ids.map((id, index) => ({
    id,
    x: startX + index * (nodeWidth + gap),
    y,
  }));
}

function stackedColumnPositions(ids, x, startY, nodeHeight, gap) {
  return ids.map((id, index) => ({
    id,
    x,
    y: startY + index * (nodeHeight + gap),
  }));
}

function graphNodeMarkup(node, style) {
  const photo = node.main_photo
    ? `<img class="graph-node-photo" src="${imageUrl(node.card_type, node.directory, node.main_photo)}" alt="${escapeHtml(node.title)}" />`
    : '<div class="graph-node-photo graph-node-photo-placeholder"></div>';
  return `
    <button
      class="graph-node ${node.is_center ? "is-center" : ""} ${node.card_type === "group" ? "is-group" : ""}"
      type="button"
      style="left:${style.x}px;top:${style.y}px;width:${style.width}px;min-height:${style.height}px"
      data-graph-open="${escapeHtml(node.path)}"
    >
      <div class="graph-node-layout">
        ${photo}
        <div class="graph-node-copy">
          <span class="graph-node-number">${escapeHtml(node.number)}</span>
          <span class="graph-node-title">${escapeHtml(node.title)}</span>
          <span class="graph-node-meta">${escapeHtml(graphNodeMeta(node))}</span>
        </div>
      </div>
    </button>
  `;
}

function graphEdgePath(fromRect, toRect) {
  const startX = fromRect.x + fromRect.width / 2;
  const startY = fromRect.y + fromRect.height / 2;
  const endX = toRect.x + toRect.width / 2;
  const endY = toRect.y + toRect.height / 2;
  const deltaX = Math.abs(endX - startX);
  const controlOffset = Math.max(24, Math.min(96, deltaX / 2));
  return `M ${startX} ${startY} C ${startX} ${startY + controlOffset}, ${endX} ${endY - controlOffset}, ${endX} ${endY}`;
}

// Ортогональная ломаная со скруглением углов по радиусу.
// points — массив {x, y}; повороты предполагаются под прямым углом.
function roundedPolylinePath(points, radius) {
  const pts = [];
  points.forEach((point) => {
    const last = pts[pts.length - 1];
    if (!last || last.x !== point.x || last.y !== point.y) {
      pts.push(point);
    }
  });
  if (pts.length < 2) {
    return "";
  }

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const prev = pts[i - 1];
    const corner = pts[i];
    const next = pts[i + 1];
    const lenIn = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const lenOut = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(radius, lenIn / 2, lenOut / 2);
    const inX = corner.x - ((corner.x - prev.x) / (lenIn || 1)) * r;
    const inY = corner.y - ((corner.y - prev.y) / (lenIn || 1)) * r;
    const outX = corner.x + ((next.x - corner.x) / (lenOut || 1)) * r;
    const outY = corner.y + ((next.y - corner.y) / (lenOut || 1)) * r;
    d += ` L ${inX} ${inY} Q ${corner.x} ${corner.y} ${outX} ${outY}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

// Группируем рёбра «родитель → ребёнок» в семьи по набору родителей ребёнка.
// Полукровные дети (разный набор родителей) попадают в разные семьи.
function buildFamilyGroups(edges, rects) {
  const childParents = new Map();
  edges.forEach((edge) => {
    if (!rects.has(edge.from) || !rects.has(edge.to)) {
      return;
    }
    if (!childParents.has(edge.to)) {
      childParents.set(edge.to, []);
    }
    const parents = childParents.get(edge.to);
    if (!parents.includes(edge.from)) {
      parents.push(edge.from);
    }
  });

  const families = new Map();
  childParents.forEach((parents, child) => {
    const key = [...parents].sort().join("|");
    if (!families.has(key)) {
      families.set(key, { parents: [...parents].sort(), children: [] });
    }
    families.get(key).children.push(child);
  });
  return Array.from(families.values());
}

// Рёбра общего графа: ортогональные линии со скруглением. Родители сходятся
// на горизонтальной шине к общему стволу, от него линии расходятся к детям.
// Одиночная связь (1 родитель → 1 ребёнок) рисуется цельной линией без ствола.
function buildFamilyEdgesHtml(edges, rects) {
  const parts = [];
  const cornerRadius = 4;

  buildFamilyGroups(edges, rects).forEach((family) => {
    const parentRects = family.parents.map((id) => rects.get(id)).filter(Boolean);
    const childRects = family.children.map((id) => rects.get(id)).filter(Boolean);
    if (!parentRects.length || !childRects.length) {
      return;
    }

    const parentBottom = Math.max(...parentRects.map((rect) => rect.y + rect.height));
    const childTop = Math.min(...childRects.map((rect) => rect.y));
    const junctionX = Math.round(average(parentRects.map((rect) => rect.x + rect.width / 2)));

    const isSingleLink = parentRects.length === 1 && childRects.length === 1;

    // Одна связь: цельная линия без общего узла.
    if (isSingleLink) {
      const px = parentRects[0].x + parentRects[0].width / 2;
      const cx = childRects[0].x + childRects[0].width / 2;
      const midY = Math.max(parentBottom + 12, Math.round((parentBottom + childTop) / 2));
      const points = [
        { x: px, y: parentBottom },
        { x: px, y: midY },
        { x: cx, y: midY },
        { x: cx, y: childRects[0].y },
      ];
      parts.push(`<path class="graph-edge" d="${roundedPolylinePath(points, cornerRadius)}"></path>`);
      return;
    }

    // Шину родителей держим у родителей, шину детей — у детей, между ними ствол.
    const busInset = 18;
    let parentBusY = parentBottom + busInset;
    let childBusY = childTop - busInset;
    if (childBusY <= parentBusY) {
      const mid = Math.round((parentBottom + childTop) / 2);
      parentBusY = Math.max(parentBottom + 6, mid - 12);
      childBusY = Math.min(childTop - 6, mid + 12);
    }

    // Родители: вниз до своей шины, затем по шине к общему узлу.
    parentRects.forEach((rect) => {
      const px = rect.x + rect.width / 2;
      const points = [
        { x: px, y: parentBottom },
        { x: px, y: parentBusY },
        { x: junctionX, y: parentBusY },
      ];
      parts.push(`<path class="graph-edge" d="${roundedPolylinePath(points, cornerRadius)}"></path>`);
    });

    // Ствол между шинами.
    parts.push(`<path class="graph-edge" d="M ${junctionX} ${parentBusY} L ${junctionX} ${childBusY}"></path>`);

    // Одна общая горизонтальная шина детей (перекрывает ствол), плюс по одному
    // вертикальному ответвлению к каждому ребёнку — так горизонтальные сегменты
    // не накладываются друг на друга и линия не «утолщается».
    const childCenters = childRects.map((rect) => rect.x + rect.width / 2);
    const busLeft = Math.min(junctionX, ...childCenters);
    const busRight = Math.max(junctionX, ...childCenters);
    if (busRight - busLeft > 0.5) {
      parts.push(`<path class="graph-edge" d="M ${busLeft} ${childBusY} L ${busRight} ${childBusY}"></path>`);
    }
    childRects.forEach((rect) => {
      const cx = rect.x + rect.width / 2;
      parts.push(`<path class="graph-edge" d="M ${cx} ${childBusY} L ${cx} ${rect.y}"></path>`);
    });
  });

  return parts.join("");
}

function average(values) {
  if (!values.length) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countEdgeCrossings(rowA, rowB, outgoingMap) {
  const posA = new Map(rowA.map((id, index) => [id, index]));
  const posB = new Map(rowB.map((id, index) => [id, index]));
  const edges = [];

  rowA.forEach((sourceId) => {
    (outgoingMap.get(sourceId) || []).forEach((targetId) => {
      if (!posB.has(targetId)) {
        return;
      }
      edges.push([posA.get(sourceId), posB.get(targetId)]);
    });
  });

  let crossings = 0;
  for (let left = 0; left < edges.length; left += 1) {
    for (let right = left + 1; right < edges.length; right += 1) {
      const [a1, b1] = edges[left];
      const [a2, b2] = edges[right];
      if ((a1 < a2 && b1 > b2) || (a1 > a2 && b1 < b2)) {
        crossings += 1;
      }
    }
  }
  return crossings;
}

function optimizeOverviewRows(rows, incomingMap, outgoingMap, nodeOrder) {
  const normalizedRows = rows.map((rowIds) => [...rowIds]);

  const sortRowByTargets = (rowIndex, targetMap, rowSourceIndex) => {
    const referenceRow = normalizedRows[rowSourceIndex];
    const referencePositions = new Map(referenceRow.map((id, index) => [id, index]));
    normalizedRows[rowIndex].sort((left, right) => {
      const leftTargets = (targetMap.get(left) || []).map((id) => referencePositions.get(id)).filter((value) => value !== undefined);
      const rightTargets = (targetMap.get(right) || []).map((id) => referencePositions.get(id)).filter((value) => value !== undefined);
      const leftScore = average(leftTargets);
      const rightScore = average(rightTargets);
      if (leftScore === null && rightScore === null) {
        return (nodeOrder.get(left) || 0) - (nodeOrder.get(right) || 0);
      }
      if (leftScore === null) {
        return 1;
      }
      if (rightScore === null) {
        return -1;
      }
      if (leftScore !== rightScore) {
        return leftScore - rightScore;
      }
      return (nodeOrder.get(left) || 0) - (nodeOrder.get(right) || 0);
    });
  };

  const improveByAdjacentSwaps = (rowIndex) => {
    if (rowIndex < 0 || rowIndex >= normalizedRows.length) {
      return;
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (let index = 0; index < normalizedRows[rowIndex].length - 1; index += 1) {
        const currentRow = normalizedRows[rowIndex];
        const currentScore =
          (rowIndex > 0 ? countEdgeCrossings(normalizedRows[rowIndex - 1], currentRow, outgoingMap) : 0) +
          (rowIndex < normalizedRows.length - 1 ? countEdgeCrossings(currentRow, normalizedRows[rowIndex + 1], outgoingMap) : 0);

        const swappedRow = [...currentRow];
        [swappedRow[index], swappedRow[index + 1]] = [swappedRow[index + 1], swappedRow[index]];
        normalizedRows[rowIndex] = swappedRow;
        const swappedScore =
          (rowIndex > 0 ? countEdgeCrossings(normalizedRows[rowIndex - 1], swappedRow, outgoingMap) : 0) +
          (rowIndex < normalizedRows.length - 1 ? countEdgeCrossings(swappedRow, normalizedRows[rowIndex + 1], outgoingMap) : 0);

        if (swappedScore < currentScore) {
          changed = true;
        } else {
          normalizedRows[rowIndex] = currentRow;
        }
      }
    }
  };

  for (let iteration = 0; iteration < 4; iteration += 1) {
    for (let rowIndex = 1; rowIndex < normalizedRows.length; rowIndex += 1) {
      sortRowByTargets(rowIndex, incomingMap, rowIndex - 1);
      improveByAdjacentSwaps(rowIndex);
    }
    for (let rowIndex = normalizedRows.length - 2; rowIndex >= 0; rowIndex -= 1) {
      sortRowByTargets(rowIndex, outgoingMap, rowIndex + 1);
      improveByAdjacentSwaps(rowIndex);
    }
  }

  return normalizedRows;
}

function buildOverviewRows(graphNodes, graphEdges) {
  const nodeOrder = new Map(graphNodes.map((node, index) => [node.id, index]));
  const childMap = new Map(graphNodes.map((node) => [node.id, []]));
  const parentMap = new Map(graphNodes.map((node) => [node.id, []]));
  const levelMap = new Map();

  graphEdges.forEach((edge) => {
    if (!childMap.has(edge.from) || !parentMap.has(edge.to)) {
      return;
    }
    childMap.get(edge.from).push(edge.to);
    parentMap.get(edge.to).push(edge.from);
  });

  const anchorNode = graphNodes.find((node) => node.number === "К-001") || graphNodes[0] || null;
  if (!anchorNode) {
    return {
      rows: [],
      minLevel: 0,
      parentMap,
      childMap,
      nodeOrder,
    };
  }

  const queue = [anchorNode.id];
  levelMap.set(anchorNode.id, 0);

  while (queue.length) {
    const currentId = queue.shift();
    const currentLevel = levelMap.get(currentId) || 0;

    (parentMap.get(currentId) || []).forEach((parentId) => {
      if (levelMap.has(parentId)) {
        return;
      }
      levelMap.set(parentId, currentLevel - 1);
      queue.push(parentId);
    });

    (childMap.get(currentId) || []).forEach((childId) => {
      if (levelMap.has(childId)) {
        return;
      }
      levelMap.set(childId, currentLevel + 1);
      queue.push(childId);
    });
  }

  const assignedLevels = Array.from(levelMap.values());
  let maxAssignedLevel = assignedLevels.length ? Math.max(...assignedLevels) : 0;

  graphNodes
    .filter((node) => !levelMap.has(node.id))
    .sort((left, right) => (nodeOrder.get(left.id) || 0) - (nodeOrder.get(right.id) || 0))
    .forEach((node, index) => {
      levelMap.set(node.id, maxAssignedLevel + index + 2);
    });

  const levels = Array.from(levelMap.values());
  const minLevel = levels.length ? Math.min(...levels) : 0;
  const maxLevel = levels.length ? Math.max(...levels) : 0;
  const rows = Array.from({ length: maxLevel - minLevel + 1 }, () => []);

  graphNodes.forEach((node) => {
    const level = levelMap.get(node.id) || 0;
    rows[level - minLevel].push(node.id);
  });

  rows.forEach((rowIds) => {
    rowIds.sort((left, right) => (nodeOrder.get(left) || 0) - (nodeOrder.get(right) || 0));
  });

  return {
    rows: optimizeOverviewRows(rows, parentMap, childMap, nodeOrder),
    minLevel,
    parentMap,
    childMap,
    nodeOrder,
  };
}

// Старая самописная раскладка (Сугияма вручную). Возвращает позиции узлов,
// подписи поколений и размеры холста. Оставлена для сравнения с dagre.
function computeOverviewLayoutLegacy(nodes, edges, { nodeWidth, nodeHeight, gap, laneGap, padding }) {
  const positions = new Map();
  const laneLabels = [];
  const { rows: optimizedRows, minLevel } = buildOverviewRows(nodes, edges);

  const widestRow = Math.max(...optimizedRows.map((rowIds) => rowIds.length), 1);
  const width = Math.max(960, padding * 2 + widestRow * nodeWidth + Math.max(0, widestRow - 1) * gap);

  let currentY = padding;
  optimizedRows.forEach((rowIds, levelIndex) => {
    const relativeLevel = minLevel + levelIndex;
    const label = relativeLevel === 0 ? "Поколение К-001" : `Поколение ${relativeLevel > 0 ? `+${relativeLevel}` : relativeLevel}`;
    laneLabels.push({ text: label, x: padding, y: currentY - 22 });
    centeredRowPositions(rowIds, currentY, width, nodeWidth, gap, padding).forEach((item) => positions.set(item.id, item));
    currentY += nodeHeight + laneGap;
  });

  const height = Math.max(currentY + padding - laneGap, 560);
  return { positions, laneLabels, width, height };
}

// Пере-упорядочивает узлы внутри каждого ряда так, чтобы супруги (со-родители)
// стояли рядом цепочкой, ориентированной по родителям в ряду сверху. Значения x
// (слоты dagre) не меняются — узлам лишь переприсваиваются те же слоты в новом
// порядке, поэтому наложений не возникает, а пересечения рёбер уменьшаются.
function orderRowsByRelations(positions, edges, nodeIds) {
  const childParents = new Map();
  edges.forEach((edge) => {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      return;
    }
    if (!childParents.has(edge.to)) {
      childParents.set(edge.to, []);
    }
    const arr = childParents.get(edge.to);
    if (!arr.includes(edge.from)) {
      arr.push(edge.from);
    }
  });

  // граф супругов: со-родители одного ребёнка — соседи
  const partners = new Map();
  const addPartner = (a, b) => {
    if (!partners.has(a)) {
      partners.set(a, new Set());
    }
    partners.get(a).add(b);
  };
  childParents.forEach((ps) => {
    for (let i = 0; i < ps.length; i += 1) {
      for (let j = i + 1; j < ps.length; j += 1) {
        addPartner(ps[i], ps[j]);
        addPartner(ps[j], ps[i]);
      }
    }
  });

  const rows = new Map();
  positions.forEach((point) => {
    const key = Math.round(point.y);
    if (!rows.has(key)) {
      rows.set(key, []);
    }
    rows.get(key).push(point.id);
  });
  const rowKeys = Array.from(rows.keys()).sort((left, right) => left - right);

  // ключ ориентации: барицентр родителей (ряды сверху уже пересобраны);
  // без родителей — текущий x самого узла
  const memberKey = (id) => {
    const ps = (childParents.get(id) || []).filter((pid) => positions.has(pid));
    if (!ps.length) {
      return positions.get(id).x;
    }
    return ps.reduce((sum, pid) => sum + positions.get(pid).x, 0) / ps.length;
  };

  rowKeys.forEach((rowKey) => {
    const members = rows.get(rowKey);
    if (members.length < 2) {
      return;
    }
    const inRow = new Set(members);
    const adj = new Map(
      members.map((id) => [id, Array.from(partners.get(id) || []).filter((p) => inRow.has(p))]),
    );

    // связные компоненты по связям супругов
    const seen = new Set();
    const components = [];
    members.forEach((start) => {
      if (seen.has(start)) {
        return;
      }
      const comp = [];
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const cur = stack.pop();
        comp.push(cur);
        adj.get(cur).forEach((nb) => {
          if (!seen.has(nb)) {
            seen.add(nb);
            stack.push(nb);
          }
        });
      }
      components.push(comp);
    });

    const linearize = (comp) => {
      if (comp.length === 1) {
        return comp;
      }
      const degree = (id) => adj.get(id).length;
      // сложный узел (многожёнство) линейно не разложить — просто по барицентру
      if (!comp.every((id) => degree(id) <= 2)) {
        return [...comp].sort((a, b) => memberKey(a) - memberKey(b));
      }
      // путь: старт с конца (степень ≤1) с меньшим ключом, идём по цепочке
      const endpoints = comp.filter((id) => degree(id) <= 1).sort((a, b) => memberKey(a) - memberKey(b));
      const start = endpoints.length ? endpoints[0] : comp[0];
      const order = [];
      const visited = new Set();
      let cur = start;
      while (cur !== undefined && !visited.has(cur)) {
        order.push(cur);
        visited.add(cur);
        cur = adj.get(cur).find((nb) => !visited.has(nb));
      }
      return order;
    };

    const ordered = components
      .map((comp) => ({
        comp: linearize(comp),
        key: comp.reduce((sum, id) => sum + memberKey(id), 0) / comp.length,
      }))
      .sort((left, right) => left.key - right.key)
      .flatMap((item) => item.comp);

    // те же слоты x, но в новом порядке
    const slots = members.map((id) => positions.get(id).x).sort((left, right) => left - right);
    ordered.forEach((id, index) => {
      positions.get(id).x = slots[index];
    });
  });
}

// Ставит детей каждой семьи плотным блоком по центру под стыком родителей
// (junctionX = средний центр родителей, как в buildFamilyEdgesHtml). Двигаем
// только детей и только если они идут подряд в своём ряду; блок зажат промежутком
// между соседями по ряду — наложений не возникает. In-place по positions.
function tightenChildrenUnderParents(positions, edges, nodeIds, { nodeWidth, gap }) {
  const childParents = new Map();
  edges.forEach((edge) => {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      return;
    }
    if (!childParents.has(edge.to)) {
      childParents.set(edge.to, []);
    }
    const parents = childParents.get(edge.to);
    if (!parents.includes(edge.from)) {
      parents.push(edge.from);
    }
  });

  const families = new Map();
  childParents.forEach((parents, child) => {
    const key = [...parents].sort().join("|");
    if (!families.has(key)) {
      families.set(key, { parents: [...parents].sort(), children: [] });
    }
    families.get(key).children.push(child);
  });

  // Узлы, у которых есть свои дети («якоря пары»), позиционируются своей парой
  // над своими детьми (recenter), а не под родителями — их не двигаем, иначе
  // разорвём брак (напр. Игорь — сын одной пары и муж в другой).
  const hasChildren = new Set();
  edges.forEach((edge) => {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
      hasChildren.add(edge.from);
    }
  });

  const rowFor = (id) => Math.round(positions.get(id).y);
  const buildRow = (rowKey) =>
    Array.from(positions.values())
      .filter((point) => Math.round(point.y) === rowKey)
      .sort((left, right) => left.x - right.x)
      .map((point) => point.id);

  // по возрастанию junctionX — соседние слева семьи выставляются первыми,
  // чтобы правые видели корректную левую границу
  const ordered = Array.from(families.values())
    .map((family) => {
      const parentRects = family.parents.map((id) => positions.get(id)).filter(Boolean);
      const junctionX = parentRects.length
        ? parentRects.reduce((sum, point) => sum + point.x + nodeWidth / 2, 0) / parentRects.length
        : 0;
      return { family, junctionX };
    })
    .sort((left, right) => left.junctionX - right.junctionX);

  ordered.forEach(({ family, junctionX }) => {
    const kids = family.children.filter((id) => positions.has(id) && !hasChildren.has(id));
    if (!kids.length) {
      return;
    }
    const rowKey = rowFor(kids[0]);
    if (!kids.every((id) => rowFor(id) === rowKey)) {
      return; // дети в разных рядах — не трогаем
    }
    const row = buildRow(rowKey);
    const sortedKids = [...kids].sort((a, b) => positions.get(a).x - positions.get(b).x);
    const indices = sortedKids.map((id) => row.indexOf(id));
    const contiguous = indices.every((value, i) => i === 0 || value === indices[i - 1] + 1);
    if (!contiguous) {
      return; // между детьми стоит чужой узел — блоком не сдвинуть
    }

    const firstIndex = indices[0];
    const lastIndex = indices[indices.length - 1];
    const count = sortedKids.length;
    const blockWidth = count * nodeWidth + Math.max(0, count - 1) * gap;
    let leftX = junctionX - blockWidth / 2;
    const lowerBound = firstIndex > 0 ? positions.get(row[firstIndex - 1]).x + nodeWidth + gap : -Infinity;
    const upperBound =
      lastIndex < row.length - 1 ? positions.get(row[lastIndex + 1]).x - gap - blockWidth : Infinity;
    if (lowerBound > upperBound) {
      return; // места нет
    }
    leftX = Math.max(lowerBound, Math.min(upperBound, leftX));
    sortedKids.forEach((id, i) => {
      positions.get(id).x = leftX + i * (nodeWidth + gap);
    });
  });
}

// Сдвигает пары супругов вплотную и центрирует их над детьми (in-place по positions).
// Правим только пару, если оба супруга: состоят ровно в одной такой семье,
// лежат в одном ряду и стоят рядом по порядку — иначе оставляем как есть.
// Сдвиг зажат промежутком между соседями по ряду, поэтому наложений не возникает.
function recenterCouplesOverChildren(positions, edges, nodeIds, { nodeWidth, nodeHeight, gap }) {
  const childParents = new Map();
  edges.forEach((edge) => {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      return;
    }
    if (!childParents.has(edge.to)) {
      childParents.set(edge.to, []);
    }
    const parents = childParents.get(edge.to);
    if (!parents.includes(edge.from)) {
      parents.push(edge.from);
    }
  });

  const families = new Map();
  childParents.forEach((parents, child) => {
    const key = [...parents].sort().join("|");
    if (!families.has(key)) {
      families.set(key, { parents: [...parents].sort(), children: [] });
    }
    families.get(key).children.push(child);
  });

  // сколько раз узел выступает родителем в паре — при повторном браке пару пропускаем
  const coupleMembership = new Map();
  families.forEach((family) => {
    if (family.parents.length === 2) {
      family.parents.forEach((id) => coupleMembership.set(id, (coupleMembership.get(id) || 0) + 1));
    }
  });

  const rowFor = (id) => Math.round(positions.get(id).y);
  const buildRow = (rowKey) =>
    Array.from(positions.values())
      .filter((point) => Math.round(point.y) === rowKey)
      .sort((left, right) => left.x - right.x)
      .map((point) => point.id);

  families.forEach((family) => {
    if (family.parents.length !== 2) {
      return;
    }
    const [first, second] = family.parents;
    const pointA = positions.get(first);
    const pointB = positions.get(second);
    if (!pointA || !pointB) {
      return;
    }
    if (coupleMembership.get(first) > 1 || coupleMembership.get(second) > 1) {
      return;
    }
    if (rowFor(first) !== rowFor(second)) {
      return;
    }

    const leftId = pointA.x <= pointB.x ? first : second;
    const rightId = pointA.x <= pointB.x ? second : first;
    const row = buildRow(rowFor(first));
    const leftIndex = row.indexOf(leftId);
    const rightIndex = row.indexOf(rightId);
    if (rightIndex !== leftIndex + 1) {
      return; // между супругами кто-то есть — не трогаем
    }

    const childCenters = family.children
      .map((id) => positions.get(id))
      .filter(Boolean)
      .map((point) => point.x + nodeWidth / 2);
    if (!childCenters.length) {
      return;
    }
    const childCenter = (Math.min(...childCenters) + Math.max(...childCenters)) / 2;

    const pairWidth = 2 * nodeWidth + gap;
    let leftX = childCenter - pairWidth / 2;
    const lowerBound = leftIndex > 0 ? positions.get(row[leftIndex - 1]).x + nodeWidth + gap : -Infinity;
    const upperBound =
      rightIndex < row.length - 1 ? positions.get(row[rightIndex + 1]).x - gap - pairWidth : Infinity;
    if (lowerBound > upperBound) {
      return; // места ужать пару нет
    }
    leftX = Math.max(lowerBound, Math.min(upperBound, leftX));

    positions.get(leftId).x = leftX;
    positions.get(rightId).x = leftX + nodeWidth + gap;
  });
}

// Ставит «висячего» супруга (без рёбер родитель/ребёнок) рядом с его партнёром
// в тот же ряд: слева, если там есть место, иначе справа (при необходимости
// раздвигая ряд). In-place по positions; couples — массив пар [idA, idB].
function placeFloatingSpouses(positions, couples, edges, nodeIds, { nodeWidth, gap }) {
  const degree = new Map();
  edges.forEach((edge) => {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
      degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
      degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
    }
  });
  const step = nodeWidth + gap;

  (couples || []).forEach((pair) => {
    const [a, b] = pair;
    if (!positions.has(a) || !positions.has(b)) {
      return;
    }
    const da = degree.get(a) || 0;
    const db = degree.get(b) || 0;
    let floater;
    let anchor;
    if (da === 0 && db > 0) {
      floater = a;
      anchor = b;
    } else if (db === 0 && da > 0) {
      floater = b;
      anchor = a;
    } else {
      return; // оба связаны (уже размещены семьями) либо оба висячие
    }

    const anchorPoint = positions.get(anchor);
    const floatPoint = positions.get(floater);
    floatPoint.y = anchorPoint.y;

    const rowKey = Math.round(anchorPoint.y);
    const rowExceptFloater = Array.from(positions.values())
      .filter((point) => point.id !== floater && Math.round(point.y) === rowKey)
      .sort((left, right) => left.x - right.x);

    const leftNeighbor = rowExceptFloater.filter((point) => point.x < anchorPoint.x).pop();
    const leftSlot = anchorPoint.x - step;
    if (!leftNeighbor || leftNeighbor.x + step <= leftSlot + 0.5) {
      floatPoint.x = leftSlot;
      return;
    }

    const rightSlot = anchorPoint.x + step;
    const rightNeighbor = rowExceptFloater.find((point) => point.x > anchorPoint.x);
    if (!rightNeighbor || rightNeighbor.x >= rightSlot + step - 0.5) {
      floatPoint.x = rightSlot;
      return;
    }

    // места нет ни слева, ни справа — раздвигаем всё правее партнёра
    rowExceptFloater.forEach((point) => {
      if (point.x > anchorPoint.x) {
        point.x += step;
      }
    });
    floatPoint.x = rightSlot;
  });
}

// Горизонтальная «брачная» линия между супругами БЕЗ общих детей (пары с детьми
// уже соединены через шину детей). Рисуем только для соседних в одном ряду.
function buildCoupleEdgesHtml(couples, rects, edges) {
  if (!couples || !couples.length) {
    return "";
  }
  // ключи пар родителей, у которых есть дети — их пропускаем
  const childParents = new Map();
  edges.forEach((edge) => {
    if (!childParents.has(edge.to)) {
      childParents.set(edge.to, []);
    }
    const parents = childParents.get(edge.to);
    if (!parents.includes(edge.from)) {
      parents.push(edge.from);
    }
  });
  const haveChildren = new Set();
  childParents.forEach((parents) => {
    if (parents.length === 2) {
      haveChildren.add([...parents].sort().join("|"));
    }
  });

  const parts = [];
  couples.forEach((pair) => {
    const [a, b] = pair;
    if (haveChildren.has([...pair].sort().join("|"))) {
      return;
    }
    const rectA = rects.get(a);
    const rectB = rects.get(b);
    if (!rectA || !rectB) {
      return;
    }
    if (Math.round(rectA.y) !== Math.round(rectB.y)) {
      return; // в разных рядах — соединитель не рисуем
    }
    const left = rectA.x <= rectB.x ? rectA : rectB;
    const right = rectA.x <= rectB.x ? rectB : rectA;
    const innerGap = right.x - (left.x + left.width);
    if (innerGap > left.width) {
      return; // слишком далеко — длинная линия через чужие узлы, пропускаем
    }
    // «Скобка» в общем стиле: от низа каждого супруга вниз к общей шине и
    // соединение по ней (со скруглением углов, как у остальных рёбер).
    const leftCx = left.x + left.width / 2;
    const rightCx = right.x + right.width / 2;
    const bottomY = left.y + left.height;
    const busY = bottomY + 18;
    const points = [
      { x: leftCx, y: bottomY },
      { x: leftCx, y: busY },
      { x: rightCx, y: busY },
      { x: rightCx, y: bottomY },
    ];
    parts.push(`<path class="graph-edge graph-edge-couple" d="${roundedPolylinePath(points, 4)}"></path>`);
  });
  return parts.join("");
}

// Новая раскладка через dagre. Наш рендер узлов/рёбер не меняется — dagre отдаёт только координаты.
function computeOverviewLayoutDagre(nodes, edges, options) {
  const { nodeWidth, nodeHeight, gap, laneGap, padding, couples = [] } = options;

  // Если библиотека почему-то не загрузилась — тихо откатываемся на старую раскладку.
  if (typeof dagre === "undefined" || !dagre.graphlib) {
    return computeOverviewLayoutLegacy(nodes, edges, options);
  }

  const positions = new Map();
  const laneLabels = [];

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: gap, ranksep: laneGap, marginx: padding, marginy: padding });
  g.setDefaultEdgeLabel(() => ({}));

  const nodeIds = new Set(nodes.map((node) => node.id));
  nodes.forEach((node) => g.setNode(node.id, { width: nodeWidth, height: nodeHeight }));
  edges.forEach((edge) => {
    // добавляем только рёбра между известными узлами, иначе dagre создаст фантомные
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
      g.setEdge(edge.from, edge.to);
    }
  });

  dagre.layout(g);

  const graphSize = g.graph();
  let width = Math.max(960, Math.ceil(graphSize.width || 0));
  const height = Math.max(560, Math.ceil(graphSize.height || 0));
  // если холст шире раскладки dagre — центрируем узлы по горизонтали
  const offsetX = Math.max(0, (width - (graphSize.width || 0)) / 2);

  // dagre отдаёт координаты ЦЕНТРА узла; наш рендер ждёт левый-верхний угол
  nodes.forEach((node) => {
    const laid = g.node(node.id);
    if (!laid) {
      return;
    }
    positions.set(node.id, {
      id: node.id,
      x: laid.x - nodeWidth / 2 + offsetX,
      y: laid.y - nodeHeight / 2,
    });
  });

  // dagre упорядочивает узлы в ряду по минимизации пересечений, а не по связям,
  // поэтому цепочки браков (супруг → общий супруг → следующий супруг) он рвёт.
  // Пересобираем порядок каждого ряда по со-родительству: супруги встают рядом
  // цепочкой, ориентированной по родителям сверху. Меняем только порядок —
  // значения x (слоты dagre) переприсваиваются узлам, наложений не возникает.
  orderRowsByRelations(positions, edges, nodeIds);

  // dagre держит обоих родителей соединёнными со всеми детьми и разносит их по
  // краям веера детей (расстояние между супругами = ширина всех детей). Правим
  // это пост-обработкой: пару супругов сдвигаем вплотную и центрируем над детьми,
  // не выходя за промежуток между соседями по ряду — поэтому наложений не будет.
  recenterCouplesOverChildren(positions, edges, nodeIds, { nodeWidth, nodeHeight, gap });

  // После пересборки порядка слоты детей не совпадают со стыком их пары — линии
  // идут вбок/вкось. Локально ставим детей каждой семьи плотным блоком по центру
  // под стыком родителей, зажимая промежутком между соседями по ряду (родителей
  // не трогаем, поэтому пары остаются на месте, наложений не возникает).
  tightenChildrenUnderParents(positions, edges, nodeIds, { nodeWidth, gap });

  // Супруг без общих детей не имеет рёбер — dagre уносит его в верхний ряд.
  // Ставим такого «висячего» супруга рядом с его партнёром в тот же ряд.
  placeFloatingSpouses(positions, couples, edges, nodeIds, { nodeWidth, gap });

  // Нормализация: перемещения выше могли выйти за левый край или расширить
  // раскладку. Сдвигаем так, чтобы минимум X = padding, и пересчитываем ширину.
  let minX = Infinity;
  let maxRight = -Infinity;
  positions.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxRight = Math.max(maxRight, point.x + nodeWidth);
  });
  if (Number.isFinite(minX)) {
    const shift = padding - minX;
    if (Math.abs(shift) > 0.5) {
      positions.forEach((point) => {
        point.x += shift;
      });
      maxRight += shift;
    }
    width = Math.max(960, Math.ceil(maxRight + padding));
  }

  // Подписи поколений: узлы одного поколения делят одинаковый top. Поколение 0 — там, где К-001.
  const anchorNode = nodes.find((node) => node.number === "К-001") || nodes[0] || null;
  const rowTops = new Map();
  nodes.forEach((node) => {
    const point = positions.get(node.id);
    if (point) {
      const key = Math.round(point.y);
      if (!rowTops.has(key)) {
        rowTops.set(key, point.y);
      }
    }
  });
  const sortedTops = Array.from(rowTops.values()).sort((left, right) => left - right);
  const anchorPoint = anchorNode ? positions.get(anchorNode.id) : null;
  const anchorTop = anchorPoint ? Math.round(anchorPoint.y) : null;
  const anchorIndex = anchorTop === null ? -1 : sortedTops.findIndex((top) => Math.round(top) === anchorTop);
  sortedTops.forEach((top, index) => {
    const relativeLevel = anchorIndex >= 0 ? index - anchorIndex : index;
    const label = relativeLevel === 0 ? "Поколение К-001" : `Поколение ${relativeLevel > 0 ? `+${relativeLevel}` : relativeLevel}`;
    laneLabels.push({ text: label, x: padding, y: top - 22 });
  });

  return { positions, laneLabels, width, height };
}

// Панорамирование (зажатое колесо мыши) и зум графа.
// Трансформ применяется к #graph-canvas, вьюпорт — .graph-canvas-wrap.
const graphView = { scale: 1, x: 0, y: 0 };
let graphViewReady = false;
const GRAPH_MIN_SCALE = 0.2;
const GRAPH_MAX_SCALE = 3;

function applyGraphView() {
  graphCanvas.style.transformOrigin = "0 0";
  graphCanvas.style.transform = `translate(${graphView.x}px, ${graphView.y}px) scale(${graphView.scale})`;
}

function resetGraphView() {
  graphView.scale = 1;
  graphView.x = 0;
  graphView.y = 0;
  applyGraphView();
}

function setupGraphViewControls() {
  if (graphViewReady) {
    return;
  }
  const viewport = graphCanvas.parentElement; // .graph-canvas-wrap
  if (!viewport) {
    return;
  }
  graphViewReady = true;

  viewport.addEventListener(
    "wheel",
    (event) => {
      if (graphCanvas.classList.contains("is-hidden")) {
        return;
      }
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      const nextScale = Math.min(GRAPH_MAX_SCALE, Math.max(GRAPH_MIN_SCALE, graphView.scale * factor));
      const ratio = nextScale / graphView.scale;
      // держим точку под курсором на месте
      graphView.x = px - ratio * (px - graphView.x);
      graphView.y = py - ratio * (py - graphView.y);
      graphView.scale = nextScale;
      applyGraphView();
    },
    { passive: false },
  );

  let panning = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  viewport.addEventListener("mousedown", (event) => {
    if (event.button !== 1 || graphCanvas.classList.contains("is-hidden")) {
      return;
    }
    event.preventDefault(); // гасим авто-скролл среднего колеса
    panning = true;
    startX = event.clientX;
    startY = event.clientY;
    originX = graphView.x;
    originY = graphView.y;
    viewport.classList.add("is-panning");
  });

  window.addEventListener("mousemove", (event) => {
    if (!panning) {
      return;
    }
    graphView.x = originX + (event.clientX - startX);
    graphView.y = originY + (event.clientY - startY);
    applyGraphView();
  });

  window.addEventListener("mouseup", (event) => {
    if (event.button !== 1 || !panning) {
      return;
    }
    panning = false;
    viewport.classList.remove("is-panning");
  });
}

function renderGraph() {
  setupGraphViewControls();

  if (!editingState) {
    if (!graphState || graphState.graph_type !== "overview") {
      graphCanvas.classList.add("is-hidden");
      graphEmpty.classList.remove("is-hidden");
      graphEmpty.textContent = "Загружаю общий граф людей...";
      return;
    }
  }

  if (!graphState) {
    graphCanvas.classList.add("is-hidden");
    graphEmpty.classList.remove("is-hidden");
    graphEmpty.textContent = "Загружаю граф связей...";
    return;
  }

  const nodeMap = new Map(graphState.nodes.map((node) => [node.id, node]));
  const nodeWidth = 250;
  const nodeHeight = 100;
  const gap = 28;
  const laneGap = 72;
  const padding = 48;
  const sideGap = 74;
  const centerId = graphState.center;
  const positions = new Map();
  const laneLabels = [];

  if (graphState.graph_type === "overview") {
    const overview = USE_DAGRE_OVERVIEW
      ? computeOverviewLayoutDagre(graphState.nodes, graphState.edges, {
          nodeWidth,
          nodeHeight,
          gap,
          laneGap,
          padding,
          couples: graphState.couples || [],
        })
      : computeOverviewLayoutLegacy(graphState.nodes, graphState.edges, { nodeWidth, nodeHeight, gap, laneGap, padding });
    overview.positions.forEach((point, id) => positions.set(id, point));
    overview.laneLabels.forEach((label) => laneLabels.push(label));
    const width = overview.width;
    const height = overview.height;
    const rects = new Map();
    const nodesHtml = [];

    for (const [id, point] of positions.entries()) {
      const node = nodeMap.get(id);
      if (!node) {
        continue;
      }
      const rect = { x: point.x, y: point.y, width: nodeWidth, height: nodeHeight };
      rects.set(id, rect);
      nodesHtml.push(graphNodeMarkup(node, rect));
    }

    const edgesHtml =
      buildFamilyEdgesHtml(graphState.edges, rects) +
      buildCoupleEdgesHtml(graphState.couples || [], rects, graphState.edges);

    graphCanvas.style.width = `${width}px`;
    graphCanvas.style.height = `${height}px`;
    graphCanvas.innerHTML = `
      <svg class="graph-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
        ${edgesHtml}
      </svg>
      ${laneLabels
        .map(
          (label) => `
            <div class="graph-lane-label" style="left:${label.x}px;top:${label.y}px">${escapeHtml(label.text)}</div>
          `,
        )
        .join("")}
      ${nodesHtml.join("")}
    `;
    graphEmpty.classList.add("is-hidden");
    graphCanvas.classList.remove("is-hidden");
    resetGraphView();
    return;
  }

  const measureRow = (count) => count * nodeWidth + Math.max(0, count - 1) * gap;
  const sideWidth = graphState.card_type === "person" ? nodeWidth : 0;
  const mainWidth = graphState.card_type === "person" ? sideWidth * 2 + nodeWidth + sideGap * 2 : Math.max(nodeWidth, measureRow(Math.max(
    graphState.lanes.participants_top?.length || 0,
    graphState.lanes.participants_bottom?.length || 0,
  )));
  const width = Math.max(
    920,
    padding * 2 + mainWidth,
    padding * 2 + measureRow(graphState.lanes.siblings?.length || 0),
    padding * 2 + measureRow(graphState.lanes.partners?.length || 0),
    padding * 2 + measureRow(graphState.lanes.groups?.length || 0),
    padding * 2 + measureRow(graphState.lanes.participants_top?.length || 0),
    padding * 2 + measureRow(graphState.lanes.participants_bottom?.length || 0),
  );

  let currentY = padding;

  if (graphState.card_type === "person") {
    const siblings = graphState.lanes.siblings || [];
    const parents = graphState.lanes.parents || [];
    const children = graphState.lanes.children || [];
    const partners = graphState.lanes.partners || [];
    const groups = graphState.lanes.groups || [];

    if (siblings.length) {
      laneLabels.push({ text: "Братья и сёстры", x: padding, y: currentY - 22 });
      centeredRowPositions(siblings, currentY, width, nodeWidth, gap, padding).forEach((item) => positions.set(item.id, item));
      currentY += nodeHeight + laneGap;
    }

    const parentHeight = parents.length ? parents.length * nodeHeight + Math.max(0, parents.length - 1) * gap : nodeHeight;
    const childHeight = children.length ? children.length * nodeHeight + Math.max(0, children.length - 1) * gap : nodeHeight;
    const mainHeight = Math.max(parentHeight, childHeight, nodeHeight);
    const centerX = Math.round((width - nodeWidth) / 2);
    const centerY = currentY + Math.round((mainHeight - nodeHeight) / 2);
    const parentX = centerX - sideGap - nodeWidth;
    const childX = centerX + nodeWidth + sideGap;

    laneLabels.push({ text: "Родители", x: parentX, y: currentY - 22 });
    laneLabels.push({ text: "Карточка", x: centerX, y: currentY - 22 });
    laneLabels.push({ text: "Дети", x: childX, y: currentY - 22 });

    stackedColumnPositions(parents, parentX, currentY, nodeHeight, gap).forEach((item) => positions.set(item.id, item));
    positions.set(centerId, { id: centerId, x: centerX, y: centerY });
    stackedColumnPositions(children, childX, currentY, nodeHeight, gap).forEach((item) => positions.set(item.id, item));

    currentY += mainHeight + laneGap;

    if (partners.length) {
      laneLabels.push({ text: "Партнёры", x: padding, y: currentY - 22 });
      centeredRowPositions(partners, currentY, width, nodeWidth, gap, padding).forEach((item) => positions.set(item.id, item));
      currentY += nodeHeight + laneGap;
    }

    if (groups.length) {
      laneLabels.push({ text: "Группы", x: padding, y: currentY - 22 });
      centeredRowPositions(groups, currentY, width, nodeWidth, gap, padding).forEach((item) => positions.set(item.id, item));
      currentY += nodeHeight + laneGap;
    }
  } else {
    const topParticipants = graphState.lanes.participants_top || [];
    const bottomParticipants = graphState.lanes.participants_bottom || [];

    if (topParticipants.length) {
      laneLabels.push({ text: "Участники", x: padding, y: currentY - 22 });
      centeredRowPositions(topParticipants, currentY, width, nodeWidth, gap, padding).forEach((item) => positions.set(item.id, item));
      currentY += nodeHeight + laneGap;
    }

    positions.set(centerId, {
      id: centerId,
      x: Math.round((width - nodeWidth) / 2),
      y: currentY,
    });
    laneLabels.push({ text: "Группа", x: Math.round((width - nodeWidth) / 2), y: currentY - 22 });
    currentY += nodeHeight + laneGap;

    if (bottomParticipants.length) {
      centeredRowPositions(bottomParticipants, currentY, width, nodeWidth, gap, padding).forEach((item) => positions.set(item.id, item));
      currentY += nodeHeight + laneGap;
    }
  }

  const height = Math.max(currentY + padding - gap, 560);
  const rects = new Map();
  const nodesHtml = [];

  for (const [id, point] of positions.entries()) {
    const node = nodeMap.get(id);
    if (!node) {
      continue;
    }
    const rect = { x: point.x, y: point.y, width: nodeWidth, height: nodeHeight };
    rects.set(id, rect);
    nodesHtml.push(graphNodeMarkup(node, rect));
  }

  const edgesHtml = graphState.edges
    .map((edge) => {
      const fromRect = rects.get(edge.from);
      const toRect = rects.get(edge.to);
      if (!fromRect || !toRect) {
        return "";
      }
      return `<path class="graph-edge" d="${graphEdgePath(fromRect, toRect)}"></path>`;
    })
    .join("");

  const labelsHtml = laneLabels
    .map(
      (label) => `
        <div class="graph-lane-label" style="left:${label.x}px;top:${label.y}px">${escapeHtml(label.text)}</div>
      `,
    )
    .join("");

  graphCanvas.style.width = `${width}px`;
  graphCanvas.style.height = `${height}px`;
  graphCanvas.innerHTML = `
    <svg class="graph-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      ${edgesHtml}
    </svg>
    ${labelsHtml}
    ${nodesHtml.join("")}
  `;
  graphEmpty.classList.add("is-hidden");
  graphCanvas.classList.remove("is-hidden");
  resetGraphView();
}

async function loadGraphForCurrentCard(requestVersion = editorLoadVersion, identity = currentEditorIdentity()) {
  if (!identity) {
    await loadOverviewGraph(requestVersion);
    return;
  }

  if (identity.cardType === "place") {
    graphState = null;
    graphCanvas.classList.add("is-hidden");
    graphEmpty.classList.remove("is-hidden");
    graphEmpty.textContent = "Для карточек мест граф не строится.";
    return;
  }

  if (identity.cardType === "source") {
    graphState = null;
    graphCanvas.classList.add("is-hidden");
    graphEmpty.classList.remove("is-hidden");
    graphEmpty.textContent = "Для карточек источников граф не строится.";
    return;
  }

  if (identity.cardType === "research") {
    graphState = null;
    graphCanvas.classList.add("is-hidden");
    graphEmpty.classList.remove("is-hidden");
    graphEmpty.textContent = "Для карточек исследований граф не строится.";
    return;
  }

  const response = await fetch(
    `/api/graph?type=${encodeURIComponent(identity.cardType)}&directory=${encodeURIComponent(identity.directory)}`,
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Не удалось загрузить граф связей.");
  }
  if (requestVersion !== editorLoadVersion) {
    return;
  }
  graphState = payload;
  renderGraph();
}

async function loadOverviewGraph(requestVersion = editorLoadVersion) {
  const response = await fetch("/api/graph-overview");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Не удалось загрузить общий граф.");
  }
  if (requestVersion !== editorLoadVersion) {
    return;
  }
  graphState = payload;
  if (!editingState) {
    renderGraph();
  }
}
