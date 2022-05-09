import { Bezier, Point } from "bezier-js";
import { IPoint } from "makerjs";
import {
  abs,
  floor,
  inv,
  Matrix,
  matrix,
  max,
  min,
  multiply,
  sqrt,
  transpose,
} from "mathjs";
import { point_dist } from "./makerjs_tools";

export function pythag_h_a(h: number, a: number): number {
  return sqrt(h * h - a * a);
}

export function pythag_a_b(a: number, b: number): number {
  return sqrt(a * a + b * b);
}

// Adapted from https://stackoverflow.com/questions/4103405/what-is-the-algorithm-for-finding-the-center-of-a-circle-from-three-points
export function circleFromThreePoints(a: IPoint, b: IPoint, c: IPoint): IPoint {
  var ax = (a[0] + b[0]) / 2.0;
  var ay = (a[1] + b[1]) / 2.0;
  var ux = a[1] - b[1];
  var uy = b[0] - a[0];
  var bx = (b[0] + c[0]) / 2.0;
  var by = (b[1] + c[1]) / 2.0;
  var vx = b[1] - c[1];
  var vy = c[0] - b[0];
  var dx = ax - bx;
  var dy = ay - by;
  var vu = vx * uy - vy * ux;

  // Circle is at infinity, so just return a center that's really far away
  if (vu == 0.0) {
    var point_slope = rotNintyClock(slope(a, c));
    return applyVectorMul(a, 100000000000, point_slope);
  }

  var g = (dx * uy - dy * ux) / vu;
  return [bx + g * vx, by + g * vy];
}

export function circle_from_points(a: Point, b: Point, c: Point): Point {
  var ax = (a.x + b.x) / 2.0;
  var ay = (a.y + b.y) / 2.0;
  var ux = a.y - b.y;
  var uy = b.x - a.x;
  var bx = (b.x + c.x) / 2.0;
  var by = (b.y + c.y) / 2.0;
  var vx = b.y - c.y;
  var vy = c.x - b.x;
  var dx = ax - bx;
  var dy = ay - by;
  var vu = vx * uy - vy * ux;

  // Circle is at infinity, so just return a center that's really far away
  if (vu == 0.0) {
    var point_slope = rot_point_ninty_clock(point_sub(a, c));
    return apply_vector_mul(a, 100000000000, point_slope);
  }

  var g = (dx * uy - dy * ux) / vu;
  return { x: bx + g * vx, y: by + g * vy };
}

export function dot_vec(vec_a: IPoint, vec_b: IPoint): number {
  let sum = 0;
  for (let i = 0; i < 3; i++) {
    if (vec_a[i] != undefined && vec_b[i] != undefined) {
      sum += vec_a[i] * vec_b[i];
    }
  }
  return sum / (magnitude(vec_a) * magnitude(vec_b));
}

export function dot(center: IPoint, a: IPoint, b: IPoint): number {
  var vec_a = [a[0] - center[0], a[1] - center[1]];
  var vec_b = [b[0] - center[0], b[1] - center[1]];
  return dot_vec(vec_a, vec_b);
}

export function dot_a(center: IPoint, a: IPoint, b: IPoint): number {
  return Math.acos(dot(center, a, b));
}

export function point_vec_dot(vec_a: Point, vec_b: Point): number {
  let sum = vec_a.x * vec_b.x + vec_a.y * vec_b.y;
  if (vec_a.z != undefined && vec_b.z != undefined) {
    sum += vec_a.z * vec_b.z;
  }
  return sum;
}

export function point_vec_dot_norm(vec_a: Point, vec_b: Point): number {
  let sum = vec_a.x * vec_b.x + vec_a.y * vec_b.y;
  if (vec_a.z != undefined && vec_b.z != undefined) {
    sum += vec_a.z * vec_b.z;
  }
  return sum / (point_magnitude(vec_a) * point_magnitude(vec_b));
}

export function point_dot(center: Point, a: Point, b: Point): number {
  let vec_a: Point = {
    x: a.x - center.x,
    y: a.y - center.y,
  };
  let vec_b: Point = {
    x: b.x - center.x,
    y: b.y - center.y,
  };
  if (a.z != undefined && b.z != undefined && center.z != undefined) {
    vec_a.z = a.z - center.z;
    vec_b.z = b.z - center.z;
  }
  return point_vec_dot_norm(vec_a, vec_b);
}

export function point_dot_a(center: Point, a: Point, b: Point): number {
  return Math.acos(point_dot(center, a, b));
}

export function circle_angle(center: IPoint, a: IPoint): number {
  return Math.atan2(a[1] - center[1], a[0] - center[0]);
}

export function circle_angle_bezierjs(center: Point, a: Point): number {
  return Math.atan2(a.y - center.y, a.x - center.x);
}

export function magnitude(a: IPoint): number {
  let sum = 0;
  for (let i = 0; i < 3; i++) {
    if (a[i] != undefined) {
      sum += a[i] * a[i];
    }
  }
  return Math.sqrt(sum);
}

export function point_magnitude(a: Point): number {
  return Math.sqrt(point_vec_dot(a, a));
}

export function scale_point(a: Point, s: number): Point {
  let x = a.x * s;
  let y = a.y * s;
  if (a.z != undefined) {
    let z = a.z * s;
    return { x, y, z };
  }
  return { x, y };
}

export function as_unit(a: Point): Point {
  let mag = point_magnitude(a);
  return scale_point(a, 1.0 / mag);
}

export function signed_dot(center: IPoint, a: IPoint, b: IPoint): number {
  return (
    Math.atan2(center[1] - b[1], center[0] - b[0]) -
    Math.atan2(center[1] - a[1], center[0] - a[0])
  );
}

export function point_signed_dot(center: Point, a: Point, b: Point): number {
  return (
    Math.atan2(center.y - b.y, center.x - b.x) -
    Math.atan2(center.y - a.y, center.x - a.x)
  );
}

// From https://stackoverflow.com/questions/2150050/finding-signed-angle-between-vectors
export function rotationDir(center: IPoint, a: IPoint, b: IPoint): number {
  return Math.sign(signed_dot(center, a, b));
}

export function rotation_dir(center: Point, a: Point, b: Point): number {
  return Math.sign(point_signed_dot(center, a, b));
}

export function dist(a: IPoint, b: IPoint): number {
  return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2));
}

export function slope(a: IPoint, b: IPoint): IPoint {
  return [b[0] - a[0], b[1] - a[1]];
}

export function applyVectorMul(a: IPoint, b: number, c: IPoint): IPoint {
  return [a[0] - b * c[0], a[1] - b * c[1]];
}

export function apply_vector_mul(a: Point, b: number, c: Point): Point {
  return {
    x: a.x + b * c.x,
    y: a.y + b * c.y,
  };
}

export function rotNintyClock(a: IPoint): IPoint {
  return [-a[1], a[0]];
}

export function rotNintyCntClock(a: IPoint): IPoint {
  return [a[1], -a[0]];
}

export function rot_point_ninty_clock(a: Point): Point {
  return {
    x: -a.y,
    y: a.x,
  };
}

export function rot_point_ninty_cnt_clock(a: Point): Point {
  return {
    x: a.y,
    y: -a.x,
  };
}

export function circlePoint(
  center: IPoint,
  radius: number,
  angle: number
): IPoint {
  return [
    center[0] + radius * Math.cos(angle),
    center[1] + radius * Math.sin(angle),
  ];
}

export function circle_point_bezierjs(
  center: Point,
  radius: number,
  angle: number
): Point {
  return {
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle),
  };
}

export function project(a: IPoint, b: IPoint): IPoint {
  var mag_b = magnitude(b);
  var proj = (a[0] * b[0] + a[1] * b[1]) / (mag_b * mag_b);
  return [proj * b[0], proj * b[1]];
}

export function average_point(a: Point, b: Point): Point {
  let x = (a.x + b.x) / 2;
  let y = (a.y + b.y) / 2;
  if (a.z != undefined && b.z != undefined) {
    let z = (a.z + b.z) / 2;
    return { x, y, z };
  }
  return { x, y };
}

// Many thanks to https://pomax.github.io/bezierinfo/#curvefitting
export function bezier_controls_from_line_points(points: Point[]): Point[] {
  let controls: Point[] = [];

  // This is just a straight-ish line so slap the midpoint in the middle
  if (points.length == 2) {
    let temp = points.pop();
    if (temp != undefined) {
      controls.push(points[0]);
      controls.push(average_point(points[0], temp));
      controls.push(temp);
    }
    return controls;
  }

  let t_values = calculate_t_vals(points);
  let { T, Tt } = formTMatrix(t_values);

  // Constructing M Matrix
  let m_data: number[][] = [];
  let k = points.length - 1;
  for (let i = 0; i < points.length; i++) {
    m_data.push(points.map((v) => 0));
    m_data[i][i] = binomial(k, i);
  }

  for (let c = 0; c < points.length; c++) {
    for (let r = c + 1; r < points.length; r++) {
      let sign = (r + c) % 2 == 0 ? 1 : -1;
      m_data[r][c] = sign * binomial(r, c) * m_data[r][r];
    }
  }

  // console.log("-------")
  // m_data.map(row => row.join(", ")).forEach(val => console.log(val))

  let m: Matrix = matrix(m_data);
  let m_invert: Matrix = inv(m);

  // Getting to the good stuff
  let t_trans_mul_t_inverse = inv(multiply(Tt, T));
  let step_1 = multiply(t_trans_mul_t_inverse, Tt);
  let step_2 = multiply(m_invert, step_1);
  let x_big: Matrix = matrix(points.map((v) => [v.x]));
  let cx: Matrix = multiply(step_2, x_big);
  let x: number[][] = <number[][]>cx.toArray();

  let y_big: Matrix = matrix(points.map((val) => [val.y]));
  let cy = multiply(step_2, y_big);
  let y: number[][] = <number[][]>cy.toArray();

  let bezier_points = x.map((row, idx) => {
    return {
      x: row[0],
      y: y[idx][0],
    };
  });

  // Re-adjust the start and end to prevent drift
  bezier_points[0] = points[0];
  bezier_points[bezier_points.length - 1] = points[points.length - 1];

  return bezier_points;
}

function calculate_t_vals(datum: Point[]): number[] {
  const D = [0];
  for (let i = 1; i < datum.length; i++) {
    let dist = point_dist(datum[i], datum[i - 1]);
    D.push(dist + D[i - 1]);
  }
  let len = D[D.length - 1];
  let S = D.map((val) => val / len);
  S[S.length - 1] = 1.0;
  return S;
}

function formTMatrix(row: number[]): {
  T: Matrix;
  Tt: Matrix;
} {
  // it's actually easier to create the transposed
  // version, and then (un)transpose that to get T!
  let data = [];
  for (var i = 0; i < row.length; i++) {
    data.push(row.map((v) => v ** i));
  }
  const Tt = matrix(data);
  const T = transpose(Tt);
  return { T, Tt };
}

// Shamelessly taken from https://github.com/Pomax/BezierInfo-2/blob/aea1304d6ff9e3fcebcbca4f2dc219289df40195/docs/js/graphics-element/api/util/binomial.js
var binomialCoefficients = [[1], [1, 1]];

/**
 * ... docs go here ...
 */
export function binomial(n: number, k: number): number {
  if (n === 0) return 1;
  var lut = binomialCoefficients;
  while (n >= lut.length) {
    var s = lut.length;
    var nextRow = [1];
    for (var i = 1, prev = s - 1; i < s; i++) {
      nextRow[i] = lut[prev][i - 1] + lut[prev][i];
    }
    nextRow[s] = 1;
    lut.push(nextRow);
  }
  return lut[n][k];
}

export function point_cross_center_2d(a: Point, c: Point, b: Point): number {
  let a_tmp = {
    x: a.x - c.x,
    y: a.y - c.y,
  };
  let b_tmp = {
    x: b.x - c.x,
    y: b.y - c.y,
  };
  return a_tmp.x * b_tmp.y - a_tmp.y * b_tmp.x;
}

export function point_cross_center(a: Point, c: Point, b: Point): Point {
  let a_tmp = {
    x: a.x - c.x,
    y: a.y - c.y,
    z: (a.z ? a.z : 0) - (c.z ? c.z : 0),
  };
  let b_tmp = {
    x: b.x - c.x,
    y: b.y - c.y,
    z: (b.z ? b.z : 0) - (c.z ? c.z : 0),
  };
  return point_cross(a_tmp, b_tmp);
}

export function point_cross(a: Point, b: Point): Point {
  let a_z = a.z == undefined ? 0 : a.z;
  let b_z = b.z == undefined ? 0 : b.z;

  return {
    x: a.y * b_z - a_z * b.y,
    y: a_z * b.x - a.x * b_z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function point_add(a: Point, b: Point): Point {
  if (a.z != undefined && b.z != undefined) {
    return {
      x: a.x + b.x,
      y: a.y + b.y,
      z: a.z + b.z,
    };
  }
  return {
    x: a.x + b.x,
    y: a.y + b.y,
  };
}

export function point_sub(a: Point, b: Point): Point {
  if (a.z != undefined && b.z != undefined) {
    return {
      x: a.x - b.x,
      y: a.y - b.y,
      z: a.z - b.z,
    };
  }
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  };
}

export function point_sub_abs(a: Point, b: Point): Point {
  if (a.z != undefined && b.z != undefined) {
    return {
      x: abs(a.x - b.x),
      y: abs(a.y - b.y),
      z: abs(a.z - b.z),
    };
  }
  return {
    x: abs(a.x - b.x),
    y: abs(a.y - b.y),
  };
}

export function point_mul(a: number, b: Point): Point {
  if (b.z != undefined) {
    return {
      x: a * b.x,
      y: a * b.y,
      z: a * b.z,
    };
  }
  return {
    x: a * b.x,
    y: a * b.y,
  };
}

export interface UnrollResult {
  a_flat: Point[];
  b_flat: Point[];
  f1f4_dir: number;
  fnfn_less1_dir: number;
}

// p1 is the flattened point from the top right of the bezier, everything is unrolled from this point, it returns the
//  flattened point arrays of both
export function unroll_point_set(
  a: Point[],
  b: Point[],
  reverse_points: boolean,
  f2_init: Point,
  f2f3_ang: number,
  clockwise: boolean
): UnrollResult {
  /**
   * CLOCKWISE
   * a    b
   * 1    2
   *
   * 4    3
   *
   * - f2f3_ang refers to the initial direction of f2 -> f3
   * - clockwise refers to the rotational direction between f2f3_ang & vf2f1, the case above is the true case
   *
   * The return reference dir is the direction between f1 & f4 of the first quad
   *
   * COUNTER-CLOCKWISE
   *
   * 4    3
   *
   * 1    2
   * a    b
   */

  let start_i = 0;
  let inc_i = 1;
  let end_i = a.length - 1;

  if (reverse_points) {
    start_i = a.length - 1;
    inc_i = -1;
    end_i = 0;
  }

  // Our arrays to populate
  let a_flat: Point[] = [];
  let b_flat: Point[] = [];

  // Initial points
  let p1 = a[start_i];
  let p2 = b[start_i];

  // Calculate f2, this is a pretty similar operation to the loop body
  let f2 = f2_init;
  let f1 = { x: 0, y: 0 };
  {
    let p3 = b[start_i + inc_i];
    let t2 = point_dot_a(p2, p3, p1);
    let d12 = point_dist(p1, p2);

    if (clockwise) {
      f1 = circle_point_bezierjs(f2, d12, f2f3_ang - t2);
    } else {
      f1 = circle_point_bezierjs(f2, d12, f2f3_ang + t2);
    }
  }

  a_flat.push(f1);
  b_flat.push(f2);

  for (let i = start_i + inc_i; i != end_i + inc_i; i += inc_i) {
    let p4 = a[i];
    let p3 = b[i];

    let txf1 = circle_angle_bezierjs(f1, f2);
    let txf2 = circle_angle_bezierjs(f2, f1);

    let t1 = point_dot_a(p1, p2, p4);
    let t2 = point_dot_a(p2, p1, p3);

    let d14 = point_dist(p1, p4);
    let d23 = point_dist(p2, p3);

    if (clockwise) {
      f1 = circle_point_bezierjs(f1, d14, txf1 - t1);
      f2 = circle_point_bezierjs(f2, d23, txf2 + t2);
    } else {
      f1 = circle_point_bezierjs(f1, d14, txf1 + t1);
      f2 = circle_point_bezierjs(f2, d23, txf2 - t2);
    }

    a_flat.push(f1);
    b_flat.push(f2);

    p1 = p4;
    p2 = p3;
  }

  let f1f4_dir = circle_angle_bezierjs(a_flat[0], a_flat[1]);
  let fnfn_less1_dir = circle_angle_bezierjs(
    a_flat[a_flat.length - 1],
    a_flat[a_flat.length - 2]
  );

  return {
    a_flat,
    b_flat,
    f1f4_dir,
    fnfn_less1_dir,
  };
}

export function center_of_endpoints(points: Point[]): Point {
    return point_mul(0.5, point_add(points[0], points[points.length - 1]))
}

export function middle_value<T>(points: T[]) : T {
    return points[floor(points.length/2)];
}

export function unroll_unflat_flat(
  a: Point[],
  b: Point[],
  b_flat: Point[],
  reverse_points: boolean,
  clockwise: boolean
): UnrollResult {
  /**
   * CLOCKWISE
   * a    b
   * 1    2
   *
   * 4    3
   *
   * - f2f3_ang refers to the initial direction of f2 -> f3
   * - clockwise refers to the rotational direction between f2f3_ang & vf2f1, the case above is the true case
   *
   * The return reference dir is the direction between f1 & f4 of the first quad
   *
   * COUNTER-CLOCKWISE
   *
   * 4    3
   *
   * 1    2
   * a    b
   */

   let start_i = 0;
   let inc_i = 1;
   let end_i = a.length - 1;
 
   if (reverse_points) {
     start_i = a.length - 1;
     inc_i = -1;
     end_i = 0;
   }
 
   // Our arrays to populate
   let a_flat: Point[] = [];
 
   // Our
   // Initial points
   let p1 = a[start_i];
   let p2 = b[start_i];
 
   // Calculate f2, this is a pretty similar operation to the loop body
   let f2 = b_flat[0];
   let f2f3_ang = circle_angle_bezierjs(f2, b_flat[1]);
   let f1 = { x: 0, y: 0 };
   {
     let p3 = b[start_i + inc_i];
     let t2 = point_dot_a(p2, p3, p1);
     let d12 = point_dist(p1, p2);
 
     if (clockwise) {
       f1 = circle_point_bezierjs(f2, d12, f2f3_ang - t2);
     } else {
       f1 = circle_point_bezierjs(f2, d12, f2f3_ang + t2);
     }
   }
 
   a_flat.push(f1);
 
   for (let i = start_i + inc_i, j = 1; i != end_i + inc_i; i += inc_i, j++) {
     let p4 = a[i];
     let p3 = b[i];
 
     let txf1 = circle_angle_bezierjs(f1, f2);
     let txf2 = circle_angle_bezierjs(f2, f1);
 
     let t1 = point_dot_a(p1, p2, p4);
     let t2 = point_dot_a(p2, p1, p3);
 
     let d14 = point_dist(p1, p4);
     let d23 = point_dist(p2, p3);
 
     if (clockwise) {
       f1 = circle_point_bezierjs(f1, d14, txf1 - t1);
       f2 = circle_point_bezierjs(f2, d23, txf2 + t2);
     } else {
       f1 = circle_point_bezierjs(f1, d14, txf1 + t1);
       f2 = circle_point_bezierjs(f2, d23, txf2 - t2);
     }
 
     a_flat.push(f1);
 
     p1 = p4;
     p2 = p3;
   }
 
   let f1f4_dir = circle_angle_bezierjs(a_flat[0], a_flat[1]);
   let fnfn_less1_dir = circle_angle_bezierjs(
     a_flat[a_flat.length - 1],
     a_flat[a_flat.length - 2]
   );
 
   return {
     a_flat,
     b_flat,
     f1f4_dir,
     fnfn_less1_dir,
   };
}
