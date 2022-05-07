import BezierJs, { Bezier, Point } from "bezier-js";
import { IModel, IPath, IPathArc, IPoint, models, paths } from "makerjs";
import { abs, floor, pi, pow, sqrt } from "mathjs";
import { apply_vector_mul, as_unit, circle_angle, circle_angle_bezierjs, circle_point_bezierjs, point_sub, point_vec_dot } from "./math";

export function point_dist(a: Point, b: Point): number {
  let dist_x = a.x - b.x;
  let dist_y = a.y - b.y;
  let dist_sqr = dist_x * dist_x + dist_y * dist_y;
  if (a.z != undefined && b.z != undefined) {
    let dist_z = a.z - b.z;
    dist_sqr = dist_sqr + dist_z * dist_z;
  }
  return sqrt(dist_sqr);
}

export function ipoint_to_point(point: IPoint): Point {
  let new_point: Point = {
    x: point[0],
    y: point[1],
  };

  if (point[2] != undefined) {
    new_point["z"] = point[2];
  }
  return new_point;
}

export function point_to_ipoint(point: Point): IPoint {
  let new_point: IPoint = [point.x, point.y];
  if (point.z != undefined) {
    new_point[2] = point.z;
  }
  return new_point;
}

export function bezierjs_to_beziercurve_dimm(
  bezier: Bezier,
  dimm: number
): models.BezierCurve {
  return new models.BezierCurve(
    flatten_bezierjs(bezier, dimm).points.map(point_to_ipoint)
  );
}

export function bezier_to_beziercurve(bezier: Bezier): models.BezierCurve {
  return new models.BezierCurve(bezier.points.map(point_to_ipoint));
}

export function bezierjs_arc_to_makerjs_arc(arc: BezierJs.Arc): IPathArc {
  return new paths.Arc(
    point_to_ipoint(arc),
    arc.r,
    (arc.e * 180) / pi,
    (arc.s * 180) / pi
  );
}

export function flatten_point(point: Point, dimension: number): Point {
  if (point.z != undefined) {
    switch (dimension) {
      case 0:
        return {
          x: point.y,
          y: point.z,
        };
      case 1:
        return {
          x: point.x,
          y: point.z,
        };
      default:
        return {
          x: point.x,
          y: point.y,
        };
    }
  }
  return point;
}

export function flatten_bezierjs(curve: Bezier, dimension: number): Bezier {
  let flatten = (point: Point) => flatten_point(point, dimension);
  return new Bezier(curve.points.map(flatten));
}

export function get_bezier_t_at_dimm_dist(
  bezier: Bezier,
  dimension: number,
  value: number
): number {
  let f_dist: (p: Point) => number;
  switch (dimension) {
    case 0:
      f_dist = (p) => abs(p.x - value);
      break;
    case 1:
      f_dist = (p) => abs(p.y - value);
      break;
    default:
      f_dist = (p) => {
        if (p.z != undefined) {
          return abs(p.z - value);
        }
        return 0;
      };
      break;
  }

  let LUT = bezier.getLUT(2000);
  let dist = pow(2, 63);
  let mpos = 0;

  // Loop over the entire LUT and find the closes point
  LUT.forEach((p, idx) => {
    let new_dist = f_dist(p);
    if (new_dist < dist) {
      dist = new_dist;
      mpos = idx;
    }
  });

  // Fine grained search for a closer point
  let t_start = mpos / (LUT.length - 1);
  let max_search = (mpos + 1) / (LUT.length - 1) - t_start;
  let t_final = t_start;
  let step = 0.1 / LUT.length;
  let done_l,
    done_r = false;

  for (let d = 0; d < max_search; d += step) {
    if (!done_l) {
      let l = bezier.compute(t_start - d);
      let d_l = f_dist(l);
      if (d_l < dist) {
        dist = d_l;
        t_final = t_start - d;
      } else {
        done_l = true;
      }
    }
    if (!done_r) {
      let r = bezier.compute(t_start + d);
      let d_r = f_dist(r);
      if (d_r < dist) {
        dist = d_r;
        t_final = t_start + d;
      } else {
        done_r = true;
      }
    }
    if (done_l && done_r) {
      break;
    }
  }
  return t_final;
}

// Walks a bezier to a value in some dimension, give the point in that dimension
export function get_bezier_p_at_dimm_dist(
  bezier: Bezier,
  dimension: number,
  value: number
): Point {
  return bezier.compute(get_bezier_t_at_dimm_dist(bezier, dimension, value));
}

// Walks a bezier to a value in some dimension, give the point in that dimension
export function project_to_dimm(
  curve: models.BezierCurve,
  dimension: number,
  value: number
): IPoint {
  // First construct the bezier curve
  let points: Point[] = [
    curve.seed.origin,
    ...curve.seed.controls,
    curve.seed.end,
  ].map(ipoint_to_point);
  let bezier = new Bezier(points);

  let f_dist: (p: Point) => number;
  switch (dimension) {
    case 0:
      f_dist = (p) => abs(p.x - value);
      break;
    case 1:
      f_dist = (p) => abs(p.y - value);
      break;
    default:
      f_dist = (p) => {
        if (p.z != undefined) {
          return abs(p.z - value);
        }
        return 0;
      };
      break;
  }

  let LUT = bezier.getLUT(2000);
  let dist = pow(2, 63);
  let mpos = 0;

  // Loop over the entire LUT and find the closes point
  LUT.forEach((p, idx) => {
    let new_dist = f_dist(p);
    if (new_dist < dist) {
      dist = new_dist;
      mpos = idx;
    }
  });

  // Fine grained search for a closer point
  let t_start = mpos / (LUT.length - 1);
  let max_search = (mpos + 1) / (LUT.length - 1) - t_start;
  let t_final = t_start;
  let step = 0.1 / LUT.length;
  let done_l,
    done_r = false;

  for (let d = 0; d < max_search; d += step) {
    if (!done_l) {
      let l = bezier.compute(t_start - d);
      let d_l = f_dist(l);
      if (d_l < dist) {
        dist = d_l;
        t_final = t_start - d;
      } else {
        done_l = true;
      }
    }
    if (!done_r) {
      let r = bezier.compute(t_start + d);
      let d_r = f_dist(r);
      if (d_r < dist) {
        dist = d_r;
        t_final = t_start + d;
      } else {
        done_r = true;
      }
    }
    if (done_l && done_r) {
      break;
    }
  }

  return point_to_ipoint(bezier.compute(t_final));
}

// Flattens a bezier curve onto a plane
export function flatten_bezier(
  curve: models.BezierCurve,
  dimension: number
): models.BezierCurve {
  let old_controls = curve.seed;
  let new_controls: IPoint[] = [];

  for (let control of [
    old_controls.origin,
    ...old_controls.controls,
    old_controls.end,
  ]) {
    let new_point: IPoint = [];
    let dimm: number = 0;
    for (let i = 0; i < 3; i++) {
      if (i != dimension) {
        new_point[dimm++] = control[i];
      }
    }
    new_controls.push(new_point);
  }

  return new models.BezierCurve(new_controls);
}

export function flatten_line(
  curve: IPoint[],
  dimension: number
): models.ConnectTheDots {
  let new_line: IPoint[] = [];

  for (let control of curve) {
    let new_point: IPoint = [];
    let dimm: number = 0;
    for (let i = 0; i < 3; i++) {
      if (i != dimension) {
        new_point[dimm++] = control[i];
      }
    }
    new_line.push(new_point);
  }

  return new models.ConnectTheDots(false, new_line);
}

export function colinear_filter<T>(
  datum: T[],
  get_point: (data: T) => Point,
  minimum: number,
  tolerance: number
): T[] {
  if (datum.length <= minimum) {
    return datum;
  }

  let points: Point[] = datum.map(get_point);

  let to_remove: number[] = [];
  do {
    if (points.length - to_remove.length <= minimum) {
      break;
    }

    to_remove.reverse().forEach((idx) => {
      points.splice(idx, 1);
      datum.splice(idx, 1);
    });
    to_remove = [];

    for (let i = 1; i < points.length - 1; i++) {
      let vec_a = point_sub(points[i + 1], points[i]);
      let vec_b = point_sub(points[i - 1], points[i]);
      let dot = abs(point_vec_dot(vec_a, vec_b));
      if (dot < tolerance) {
        to_remove.push(i);

        // skip one to avoid redundant deletion
        i++;
      }
    }
  } while (to_remove.length > 0);

  return datum;
}

export function colinear_filter_points(
  datum: Point[],
  minimum: number,
  tolerance: number
): Point[] {
  if (datum.length <= minimum) {
    return datum;
  }

  let to_remove: number[] = [];
  do {
    if (datum.length - to_remove.length <= minimum) {
      break;
    }

    to_remove.reverse().forEach((idx) => {
      datum.splice(idx, 1);
    });
    to_remove = [];

    for (let i = 1; i < datum.length - 1; i++) {
      let vec_a = point_sub(datum[i + 1], datum[i]);
      let vec_b = point_sub(datum[i - 1], datum[i]);
      let dot = abs(point_vec_dot(vec_a, vec_b));
      if (dot > tolerance) {
        to_remove.push(i);

        // skip two to avoid redundant deletion
        i = i + 2;
      }
    }
  } while (to_remove.length > 0);

  return datum;
}

export function points_to_imodel(loop: boolean, points: Point[]): IModel {
  const points_clean: IPoint[] = colinear_filter_points(points, 3, 0.90).map(
    point_to_ipoint
  );
  return new models.ConnectTheDots(loop, points_clean);
}

const colours: string[] = [
  "aqua",
  "blue",
  "fuchsia",
  "green",
  "gray",
  "lime",
  "maroon",
  "navy",
  "olive",
  "orange",
  "purple",
  "red",
  "silver",
  "teal",
  "white",
  "yellow",
  // "black",
];

export function color_naturally<T extends IModel | IPath>(
  val: T,
  index: number
): T {
  val.layer = colours[index % colours.length];
  return val;
}

export class DistanceEnhancedPath {
  path: Point[];
  distances: number[];

  constructor(path: Point[] ){
    this.path = path;
    this.distances = [0];
    for(let i = 1; i < path.length; i++) {
      this.distances.push(this.distances[i - 1] + point_dist(path[i], path[i -1]));
    }
  }

  d_length() {
    return this.distances[this.distances.length - 1];
  }

  length() {
    return this.distances.length;
  }

  points_before(dist: number): Point[] {
    if (dist >= this.d_length()) {
      return this.path;
    }

    let i = 0;
    let result: Point[] = [];
    while(this.distances[i + 1] < dist){
      result.push(this.path[i]);
      i++;
    }
    return result;
  }

  points_after(dist: number): Point[] {
    if (dist > this.d_length()) {
      return [];
    } else if (dist <= 0) {
      return this.path;
    }

    let i = 0;
    while(this.distances[i + 1] < dist) {
      i++
    }

    let result: Point[] = [];
    for(let j = i + 1; j < this.distances.length; j++) {
      result.push(this.path[j]);
    }
    return(result);
  }

  point_at(dist: number) : Point {
    if (dist <= 0) {
      return this.path[0];
    } else if ( dist >= this.d_length()) {
      return this.path[this.path.length - 1];
    }

    let i = 0;
    while(this.distances[i+1] < dist) {

      // If we're lucky we'll hit on an exact match
      if (this.distances[i] == dist) {
        return this.path[i];
      }

      i++;
    }

    // Otherwise we need to interpolate
    let remaining_dist = dist - this.distances[i];
    let origin = this.path[i];
    let vec = as_unit(point_sub(this.path[i], this.path[i + 1]));
    return apply_vector_mul(origin, remaining_dist, vec);
  }
}

export function point_path_to_puzzle_teeth(path: Point[], puzzle_tooth_width: number, puzzle_tooth_angle: number) : Point[] {

  let enhanced_path = new DistanceEnhancedPath(path);

  // Calculations for the positions of the tooth starts/ends
  let n_teeth = floor(enhanced_path.d_length()/puzzle_tooth_width) - 2;
  if (n_teeth > 6) {
    n_teeth = n_teeth - 2;
  }
  let buffer_dist = (enhanced_path.d_length() - (n_teeth * puzzle_tooth_width))/2;
  let dist_refactor: number[] = [buffer_dist];
  for(let i = 0; i < n_teeth; i++) {
    dist_refactor.push(puzzle_tooth_width + dist_refactor[i]);
  }

  // If there's no space for teeth there's no point in trying to draw them
  if (dist_refactor.length < 2) {
    return path;
  }

  let result: Point[] = [];

  // The points at the start of the line, before the tooth buffer
  result.push(...enhanced_path.points_before(dist_refactor[0]));

  // This is where we make the teeth
  let prev_point = enhanced_path.point_at(dist_refactor[0]);
  for(let i = 1; i < dist_refactor.length; i++) {
    let curr_point = enhanced_path.point_at(dist_refactor[i]);

    // Build a tooth!
    let outside = i % 2 == 0;
    let angle = outside ? pi/2 : -pi/2;
    angle += circle_angle_bezierjs(prev_point, curr_point);

    let a = circle_point_bezierjs(prev_point, puzzle_tooth_width/2, angle + (outside ? puzzle_tooth_angle : -puzzle_tooth_angle));
    let b = circle_point_bezierjs(curr_point, puzzle_tooth_width/2, angle + (outside ? -puzzle_tooth_angle : puzzle_tooth_angle));

    result.push(prev_point);
    result.push(a);
    result.push(b);
    result.push(curr_point);

    prev_point = curr_point;
  }

  // The points at the end of the line, after the last tooth
  result.push(...enhanced_path.points_after(dist_refactor[dist_refactor.length - 1]));

  return result;
}