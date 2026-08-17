// Pure, immutable edit helpers for a Scenario. Keeping every mutation here means
// the data-entry components stay declarative and the (many) nested updates are
// consistent — programs, categories, per-program entries, ranges, resources.

import {
  RESOURCE_TYPES,
  type Category,
  type Constraints,
  type CostRange,
  type Program,
  type ProgramEntry,
  type ResourceDraw,
  type ResourceTypeId,
  type Scenario,
} from "./model.ts";

type RangeKey = "integratedCost" | "transitionCost";

function zeroDraw(): ResourceDraw {
  return { staffHours: 0, vehicleDays: 0, fieldDays: 0 };
}

function mapCategory(
  scenario: Scenario,
  categoryId: string,
  fn: (category: Category) => Category,
): Scenario {
  return {
    ...scenario,
    categories: scenario.categories.map((category) =>
      category.id === categoryId ? fn(category) : category,
    ),
  };
}

export function updateProgram(
  scenario: Scenario,
  programId: string,
  patch: Partial<Program>,
): Scenario {
  return {
    ...scenario,
    programs: scenario.programs.map((program) =>
      program.id === programId ? { ...program, ...patch } : program,
    ),
  };
}

export function updateConstraints(
  scenario: Scenario,
  patch: Partial<Constraints>,
): Scenario {
  return { ...scenario, constraints: { ...scenario.constraints, ...patch } };
}

export function updateCeiling(
  scenario: Scenario,
  resource: ResourceTypeId,
  value: number,
): Scenario {
  return updateConstraints(scenario, {
    resourceCeilings: {
      ...scenario.constraints.resourceCeilings,
      [resource]: value,
    },
  });
}

export function updateCategory(
  scenario: Scenario,
  categoryId: string,
  patch: Partial<Pick<Category, "name" | "shareable" | "governmentFunded">>,
): Scenario {
  return mapCategory(scenario, categoryId, (category) => ({
    ...category,
    ...patch,
  }));
}

export function updateRange(
  scenario: Scenario,
  categoryId: string,
  range: RangeKey,
  field: keyof CostRange,
  value: number,
): Scenario {
  return mapCategory(scenario, categoryId, (category) => ({
    ...category,
    [range]: { ...category[range], [field]: value },
  }));
}

export function updateIntegratedResource(
  scenario: Scenario,
  categoryId: string,
  resource: ResourceTypeId,
  value: number,
): Scenario {
  return mapCategory(scenario, categoryId, (category) => ({
    ...category,
    integratedResourceDraw: {
      ...category.integratedResourceDraw,
      [resource]: value,
    },
  }));
}

export function updateEntry(
  scenario: Scenario,
  categoryId: string,
  programId: string,
  patch: Partial<Pick<ProgramEntry, "standaloneCost">>,
): Scenario {
  return mapCategory(scenario, categoryId, (category) => ({
    ...category,
    perProgram: {
      ...category.perProgram,
      [programId]: { ...category.perProgram[programId], ...patch },
    },
  }));
}

export function updateEntryResource(
  scenario: Scenario,
  categoryId: string,
  programId: string,
  resource: ResourceTypeId,
  value: number,
): Scenario {
  return mapCategory(scenario, categoryId, (category) => ({
    ...category,
    perProgram: {
      ...category.perProgram,
      [programId]: {
        ...category.perProgram[programId],
        resourceDraw: {
          ...category.perProgram[programId].resourceDraw,
          [resource]: value,
        },
      },
    },
  }));
}

function uniqueId(prefix: string, taken: Set<string>): string {
  let n = taken.size + 1;
  let id = `${prefix}${n}`;
  while (taken.has(id)) {
    n += 1;
    id = `${prefix}${n}`;
  }
  return id;
}

export function addCategory(scenario: Scenario): Scenario {
  const id = uniqueId("cat", new Set(scenario.categories.map((c) => c.id)));
  const perProgram: Record<string, ProgramEntry> = {};
  for (const program of scenario.programs) {
    perProgram[program.id] = {
      standaloneCost: 100,
      resourceDraw: zeroDraw(),
    };
  }
  const category: Category = {
    id,
    name: "New category",
    shareable: true,
    governmentFunded: false,
    perProgram,
    integratedCost: { low: 140, point: 150, high: 170 },
    transitionCost: { low: 40, point: 50, high: 65 },
    integratedResourceDraw: zeroDraw(),
  };
  return { ...scenario, categories: [...scenario.categories, category] };
}

export function removeCategory(scenario: Scenario, categoryId: string): Scenario {
  return {
    ...scenario,
    categories: scenario.categories.filter((c) => c.id !== categoryId),
  };
}

export function addProgram(scenario: Scenario): Scenario {
  const id = uniqueId("prog", new Set(scenario.programs.map((p) => p.id)));
  const program: Program = {
    id,
    name: `Program ${scenario.programs.length + 1}`,
  };
  const categories = scenario.categories.map((category) => ({
    ...category,
    perProgram: {
      ...category.perProgram,
      [id]: {
        standaloneCost: 100,
        resourceDraw: zeroDraw(),
      },
    },
  }));
  return { ...scenario, programs: [...scenario.programs, program], categories };
}

export function removeProgram(scenario: Scenario, programId: string): Scenario {
  const categories = scenario.categories.map((category) => {
    const perProgram = { ...category.perProgram };
    delete perProgram[programId];
    return { ...category, perProgram };
  });
  return {
    ...scenario,
    programs: scenario.programs.filter((p) => p.id !== programId),
    categories,
  };
}

export { RESOURCE_TYPES };
