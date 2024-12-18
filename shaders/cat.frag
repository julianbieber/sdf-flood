#version 450
layout(location = 0) out vec4 out_color;

layout(location = 0) in vec2 uv;
layout(binding = 0) uniform UniformParameters {
    float time;
} u;
layout(binding = 1) readonly buffer fftBuffer {
    float v[];
} fft;
layout(binding = 2) readonly buffer SliderParameters {
    float v[];
} sliders;

#define PI 3.1415926538
#define TAU 6.2831853071
#define FOV 60.0
#define furDepth 0.1

struct SceneSample {
    float closest_distance;
    int index;
    vec3 rep;
    vec4 color;
    bool cont;
};

struct RayEnd {
    SceneSample s;
    vec3 current_position;
};

float hash(vec4 p) {
    p = 50.0 * fract(p * 0.3183099 + vec4(0.71, 0.113, 0.419, 0.453));
    return -1.0 + 2.0 * fract(p.x * p.y * p.z * p.w * (p.x + p.y + p.z));
}
float noised(vec4 p, float g) {
    float angle = (p.y * 0.1);
    float c = cos(angle);
    float s = sin(angle);
    mat4 rot = mat4(-1, 0, 0, 0, 0, -1, 0, 0, 0, 0, c, -s, 0, 0, s, -c);
    vec4 rotated_p = p * rot;

    const vec2 e = vec2(0.0, 1.0);
    vec4 i = floor(rotated_p); // integer
    vec4 f = fract(rotated_p); // fract

    f = f * f * (3. - 2. * f * f);

    return mix(mix(mix(mix(hash(i + e.xxxx),
                    hash(i + e.yxxx), f.x),
                mix(hash(i + e.xyxx),
                    hash(i + e.yyxx), f.x), f.y),
            mix(mix(hash(i + e.xxyx),
                    hash(i + e.yxyx), f.x),
                mix(hash(i + e.xyyx),
                    hash(i + e.yyyx), f.x), f.y), f.z),
        mix(mix(mix(hash(i + e.xxxy),
                    hash(i + e.yxxy), f.x),
                mix(hash(i + e.xyxy),
                    hash(i + e.yyxy), f.x), f.y),
            mix(mix(hash(i + e.xxyy),
                    hash(i + e.yxyy), f.x),
                mix(hash(i + e.xyyy),
                    hash(i + e.yyyy), f.x), f.y), f.z), f.w);
}

vec3 rotateX(vec3 p, float a) {
    float sa = sin(a);
    float ca = cos(a);
    return vec3(p.x, ca * p.y - sa * p.z, sa * p.y + ca * p.z);
}

vec3 rotateY(vec3 p, float a) {
    float sa = sin(a);
    float ca = cos(a);
    return vec3(ca * p.x + sa * p.z, p.y, -sa * p.x + ca * p.z);
}

vec2 cartesianToSpherical(vec3 p) {
    float r = length(p);

    float t = (r - (1.0 - furDepth)) / furDepth;
    vec3 p2 = rotateX(p.zyx, p.x).zyx; // curl

    p2 /= r;
    vec2 uv = vec2(atan(p2.y, p.x), acos(p2.z));

    //uv.x += cos(iTime*1.5)*t*t*0.4;	// curl
    //uv.y += sin(iTime*1.7)*t*t*0.2;
    uv.y -= t * 0.1; // curl down
    return uv;
}

vec3 rotate(vec3 p, float yaw, float pitch, float roll) {
    return (mat3(cos(yaw), -sin(yaw), 0.0, sin(yaw), cos(yaw), 0.0, 0.0, 0.0, 1.0) *
        mat3(cos(pitch), 0.0, sin(pitch), 0.0, 1.0, 0.0, -sin(pitch), 0.0, cos(pitch)) *
        mat3(1.0, 0.0, 0.0, 0.0, cos(roll), -sin(roll), 0.0, sin(roll), cos(roll))) *
        p;
}
float sphere(vec3 p, vec3 center, float radius) {
    return length(p - center) - radius;
}
float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

float sdCone(vec3 p, vec2 c, float h) {
    // c is the sin/cos of the angle, h is height
    // Alternatively pass q instead of (c,h),
    // which is the point at the base in 2D
    vec2 q = h * vec2(c.x / c.y, -1.0);

    vec2 w = vec2(length(p.xz), p.y);
    vec2 a = w - q * clamp(dot(w, q) / dot(q, q), 0.0, 1.0);
    vec2 b = w - q * vec2(clamp(w.x / q.x, 0.0, 1.0), 1.0);
    float k = sign(q.y);
    float d = min(dot(a, a), dot(b, b));
    float s = max(k * (w.x * q.y - w.y * q.x), k * (w.y - q.y));
    return sqrt(d) * sign(s);
}

float sdConeBound(vec3 p, vec2 c, float h) {
    float q = length(p.xz) / 2.0;
    return max(dot(c.xy, vec2(q, p.y)), -h - p.y);
}

float sdBox(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

float sdPlane(vec3 p, vec3 n, float h) {
    // n must be normalized
    return dot(p, n) + h;
}

float sdCylinder(vec3 p, vec3 c, float h, float r) {
    vec2 d = abs(vec2(length(p.xz - c.xz), p.y - c.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

SceneSample combine(SceneSample a, SceneSample b) {
    if (b.closest_distance < a.closest_distance) {
        return b;
    } else {
        return a;
    }
}

float sdTriPrism(vec3 p, vec2 h) {
    vec3 q = abs(p);
    return max(q.z - h.y, max(q.x * 0.866025 + p.y * 0.5, -p.y) - h.x * 0.5);
}

float sdRoundTriPrism(vec3 p, vec2 h, float r) {
    return max(sdTriPrism(p, h), -sdSphere(p - vec3(0.0, h.x * 0.5, -1.0), r));
}

float sdCappedTorus(vec3 p, vec2 sc, float ra, float rb) {
    p.x = abs(p.x);
    float k = (sc.y * p.x > sc.x * p.y) ? dot(p.xy, sc) : length(p.xy);
    return sqrt(dot(p, p) + ra * ra - 2.0 * ra * k) - rb;
}

float sdCatNose(vec3 p) {
    float angle = 1.38;
    vec3 rotated = rotate(p, 0.0, 0.0, PI);
    return sdConeBound(rotated ,vec2(sin(angle), cos(angle)), 0.08);
    // return sdSphere(p, 0.11);
}

float sdCatMouth(vec3 p) {
    vec3 pRot = rotate(p, PI, 0.0, 0.0);
    float left = sdCappedTorus(pRot + vec3(-0.09, 0.0, 1.0), vec2(0.1, 0.1), 0.15, 0.01);
    float right = sdCappedTorus(pRot + vec3(0.09, 0.0, 1.0), vec2(0.1, 0.1), 0.15, 0.01);
    return min(left, right);
}

SceneSample scene(vec3 p, vec3 dir) {
    vec3 rep = vec3(4.0, 10.0, 10.0);
    vec3 pRep = p - rep * round(p / rep);
    vec3 repId = round(p / rep);

    float headRadius = 1.0;
    float earSize = 0.3;
    float earOffset = 0.5;
    float eyeSize = 0.1;
    float eyeOffsetX = 0.25;
    float eyeOffsetY = 0.2;
    float mouthWidth = 0.2;
    float mouthHeight = 0.1;
    float mouthOffsetY = -0.3;
    SceneSample head = SceneSample(sdSphere(pRep, headRadius), 1, repId, vec4(0.0), true);

    SceneSample leftEar = SceneSample(sdConeBound(pRep + vec3(-earOffset, -headRadius + 0.0, 0.2), vec2(0.35, 0.1), 0.5), 2, repId, vec4(0.0), true);
    SceneSample rightEar = SceneSample(sdConeBound(pRep + vec3(earOffset, -headRadius + 0.0, 0.2), vec2(0.35, 0.1), 0.5), 2, repId, vec4(0.0), true);
    SceneSample ear = combine(leftEar, rightEar);

    SceneSample leftEye = SceneSample(sdSphere(pRep - vec3(eyeOffsetX, eyeOffsetY, -headRadius * 0.9 + 0.005), eyeSize), 3, repId, vec4(0.0), false);
    SceneSample rightEye = SceneSample(sdSphere(pRep - vec3(-eyeOffsetX, eyeOffsetY, -headRadius * 0.9 + 0.005), eyeSize), 3, repId, vec4(0.0), false);
    SceneSample eye = combine(leftEye, rightEye);


    SceneSample nose = SceneSample(sdCatNose(pRep - vec3(0.0, 0.0, -headRadius * 1.3)), 4, repId, vec4(0.0), false);
    SceneSample noseOpeningLeft1 = SceneSample(sdSphere(pRep - vec3(-0.02, 0.04, -headRadius * 1.35), 0.005), 6, repId, vec4(0.0), false);
    SceneSample noseOpeningLeft2 = SceneSample(sdSphere(pRep - vec3(-0.02, 0.03, -headRadius * 1.35), 0.005), 6, repId, vec4(0.0), false);
    SceneSample noseOpeningRight1 = SceneSample(sdSphere(pRep - vec3(0.02, 0.04, -headRadius * 1.35), 0.005), 6, repId, vec4(0.0), false);
    SceneSample noseOpeningRight2 = SceneSample(sdSphere(pRep - vec3(0.02, 0.03, -headRadius * 1.35), 0.005), 6, repId, vec4(0.0), false);
    SceneSample noseOpeningRight = combine(noseOpeningRight1, noseOpeningRight2); 
    SceneSample noseOpeningLeft = combine(noseOpeningLeft1, noseOpeningLeft2); 
    SceneSample n = combine(noseOpeningRight,combine(nose, noseOpeningLeft));

    SceneSample mouth = SceneSample(sdCatMouth(pRep), 5, repId, vec4(0.0), false);

    SceneSample combined = combine(mouth, combine(n, combine(head, combine(eye, ear))));
    return combined;
    // return head;
}

float scene_f(vec3 p, vec3 dir) {
    return scene(p, dir).closest_distance;
}

vec3 normal(in vec3 p, vec3 dir) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps, 0);
    return normalize(vec3(scene_f(p + h.xyy, dir) - scene_f(p - h.xyy, dir),
            scene_f(p + h.yxy, dir) - scene_f(p - h.yxy, dir),
            scene_f(p + h.yyx, dir) - scene_f(p - h.yyx, dir)));
}

float furDensity(vec3 pos) {
    vec2 uv = cartesianToSpherical(pos);
    float x = noised(vec4(uv * 123.0, uv), 4.1);
    float y = noised(vec4(uv * 123.0, uv * 129.0), 1.1) / 10.0;

    // thin out hair
    float furThreshold = 0.4;
    float density = smoothstep(furThreshold, 1.0, x);

    // pos.y -= elevation;
    vec3 p = pos;
    // p = rotateY(p, PI);
    float r = length(pos) - 0.12 * sin(6. * p.x) * cos(6. * p.y) * sin(6. * p.z);
    float t = (r - (1. - furDepth)) / furDepth;

    return density * (1. - t);
}

vec3 furNormal(vec3 pos, float density) {
    float eps = 0.0001;
    vec3 n;
    n.x = furDensity(vec3(pos.x + eps, pos.y, pos.z)) - density;
    n.y = furDensity(vec3(pos.x, pos.y + eps, pos.z)) - density;
    n.z = furDensity(vec3(pos.x, pos.y, pos.z + eps)) - density;
    return normalize(n);
}
vec3 furShade(vec3 pos, vec3 color, vec3 light, vec3 eye, float density) {
    vec3 v = normalize(light - pos);
    vec3 n = furNormal(pos, density);
    vec3 ev = normalize(pos - eye);
    vec3 h = reflect(ev, n);

    float diff = max(0.0, dot(v, n)) + 0.4;
    float spec = pow(max(0.0, dot(v, h)), 64.);

    float r = length(pos);
    float t = (r - (1.0 - furDepth)) / furDepth;
    t = clamp(t, 0.3, 1.);

    diff = mix(diff, 1., 0.5);

    return color * t * (diff + 1.9 * spec);
}

vec2 hash22(vec2 p, float repScale) {

    // Repetition.
    p = mod(p, repScale);

    // Faster, but doesn't disperse things quite as nicely. However, when framerate
    // is an issue, and it often is, this is a good one to use. Basically, it's a tweaked
    // amalgamation I put together, based on a couple of other random algorithms I've
    // seen around... so use it with caution, because I make a tonne of mistakes. :)
    float n = sin(dot(p, vec2(113, 1)));

    return (fract(vec2(262144, 32768) * n) - .5);
}

vec4 resolve_color(int index, vec3 p, vec3 repId, vec3 dir) {
    vec3 rep = vec3(4.0, 10.0, 10.0);
    vec3 pRep = p - rep * round(p / rep);
    if (index == 1) {
        // vec4 baseColor = vec4(hash22(sin(repId.xy + noised(vec4(p, 0.0) * 0.01, 0.0))/0.01, 1.0), hash22(cos(repId.yz), 1.0));
        vec3 baseColor = abs(vec3(
                    0.5 * noised(vec4(pRep * 4.7, repId.x * 2.1), repId.x) + noised(vec4(pRep * 0.1 + 0.45, repId.x * 0.3), repId.x),
                    0.5 * noised(vec4(pRep * 4.7, repId.y * 2.1), repId.x) + noised(vec4(pRep * 0.1 + 0.45, repId.y * 0.3), repId.x),
                    0.5 * noised(vec4(pRep * 4.7, repId.z * 2.1), repId.x) + noised(vec4(pRep * 0.1 + 0.45, repId.z * 0.3), repId.x)));
        vec3 samplePos = pRep;
        float d = furDensity(samplePos);
        vec3 n = normal(p, dir);
        vec3 light = vec3(12.0, 10.0, -10.0);
        vec3 r = reflect((light), n);
        float lightFactor = dot(n, normalize(light - pRep));
        return vec4(furShade(pRep, baseColor, vec3(0.0, 4.0, 4.0), vec3(-4.0, 0.0, -5.0), d) * 2.0 * max(lightFactor, 0.1), d);

    }
    if (index == 2) {
        float d = 0;
        // vec4 baseColor = vec4(hash22(sin(repId.xy)/0.01, 1.0), hash22(cos(repId.yz), 1.0));
        vec3 baseColor = vec3(205.0 / 255.0, 133.0 / 255.0, 63.0 / 255.0) * 0.6;
        vec3 samplePos = pRep - vec3(0.0, 1.0, 0.0);
        return vec4(baseColor, furDensity(samplePos));
    }
    if (index == 3) {
        float eyeSize = 0.1;
        float eyeOffsetX = 0.25;
        float eyeOffsetY = 0.2;
        float headRadius = 1.0;

        vec3 rightEyeCenter = vec3(-eyeOffsetX, eyeOffsetY, -headRadius);
        vec3 rightEyeLeft = rightEyeCenter - vec3(eyeSize, 0.0, 0.0);
        vec3 rightEyeRight = rightEyeCenter + vec3(eyeSize, 0.0, 0.0);
        vec3 leftEyeCenter = vec3(eyeOffsetX, eyeOffsetY, -headRadius);
        vec3 leftEyeLeft = leftEyeCenter - vec3(eyeSize - 0.01, 0.0, 0.0);
        vec3 leftEyeRight = leftEyeCenter + vec3(eyeSize + 0.01, 0.0, 0.0);
        float eyeOverLap = 1.3;
        if ((length(pRep - rightEyeLeft) < eyeSize * eyeOverLap && length(pRep - rightEyeRight) < eyeSize * eyeOverLap) ||
                (length(pRep - leftEyeLeft) < eyeSize * eyeOverLap && length(pRep - leftEyeRight) < eyeSize * eyeOverLap)) {
            return vec4(0.0, 0.0, 0.0, 1.0);
        } else {
            vec3 n = normal(p, dir);
            vec4 green = vec4(44.0 / 255.0, 73.0 / 255.0, 63.0 / 255.0, 1.0);
            vec4 neonGreen = vec4(0.0, 0.9, 0.3, 1.0);
            vec4 neonRed = vec4(0.8, 0.0, 0.3, 1.0);
            vec4 brown = vec4(91.0 / 255.0, 58.0 / 255.0, 41.0 / 255.0, 1.0);
            vec4 orange = vec4(255.0 / 255.0, 140.0 / 255.0, 0.0 / 255.0, 1.0);

            vec4 eyelid = green * dot(n, vec3(0.0, 10.0, 10.0));
            if (eyelid.w < 0.01) {
                vec3 light = vec3(2.0, 10.0, -40.0);
                vec3 specLight = vec3(3.0, -10.0, 0.0);
                vec3 r = reflect(normalize(pRep-specLight), n);
                float specilarFactor = pow(max(dot(dir, r), 0.0), 6.3);
                float lightFactor = max(0.2, dot(n, normalize(light - pRep)));
                float colorFactor = abs(sin(noised(vec4(repId * 10.0 * sign(pRep.x), 0.0), 1.0)));
                vec4 color = colorFactor * neonGreen + (1.0 - colorFactor) * orange + vec4(hash22(p.xy, 1.0), hash22(p.yz, 1.0)) * 0.1;
                return lightFactor * color * 1.0 + (color * specilarFactor * 4.001);
            }
            return vec4(0.0, 0.0, 0.0, 1.0);
        }
        return vec4(0.0, 0.0, 0.0, 1.0);
    }

    if (index == 4) {
return vec4(255.0 / 255.0, 55.0 / 255.0, 0.0 / 255.0, 1.0)*0.4;    }
    if (index == 5) {
        return vec4(1.0, 0.0, 0.0, 1.0);
    }
    vec4 c = vec4(0);
    c.w = 1.0;
    return c;
}


vec3 rotate(vec3 p, float yaw, float pitch, float roll) {
    return (mat3(cos(yaw), -sin(yaw), 0.0, sin(yaw), cos(yaw), 0.0, 0.0, 0.0, 1.0) *
        mat3(cos(pitch), 0.0, sin(pitch), 0.0, 1.0, 0.0, -sin(pitch), 0.0, cos(pitch)) *
        mat3(1.0, 0.0, 0.0, 0.0, cos(roll), -sin(roll), 0.0, sin(roll), cos(roll))) *
        p;
}
float sphere(vec3 p, vec3 center, float radius) {
    return length(p - center) - radius;
}
float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

float sdCone(vec3 p, vec2 c, float h) {
    // c is the sin/cos of the angle, h is height
    // Alternatively pass q instead of (c,h),
    // which is the point at the base in 2D
    vec2 q = h * vec2(c.x / c.y, -1.0);

    vec2 w = vec2(length(p.xz), p.y);
    vec2 a = w - q * clamp(dot(w, q) / dot(q, q), 0.0, 1.0);
    vec2 b = w - q * vec2(clamp(w.x / q.x, 0.0, 1.0), 1.0);
    float k = sign(q.y);
    float d = min(dot(a, a), dot(b, b));
    float s = max(k * (w.x * q.y - w.y * q.x), k * (w.y - q.y));
    return sqrt(d) * sign(s);
}

float sdConeBound(vec3 p, vec2 c, float h) {
    float q = length(p.xz) / 2.0;
    return max(dot(c.xy, vec2(q, p.y)), -h - p.y);
}

float sdBox(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

float sdPlane(vec3 p, vec3 n, float h) {
    // n must be normalized
    return dot(p, n) + h;
}

float sdCylinder(vec3 p, vec3 c, float h, float r) {
    vec2 d = abs(vec2(length(p.xz - c.xz), p.y - c.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

SceneSample combine(SceneSample a, SceneSample b) {
    if (b.closest_distance < a.closest_distance) {
        return b;
    } else {
        return a;
    }
}

float sdTriPrism(vec3 p, vec2 h) {
    vec3 q = abs(p);
    return max(q.z - h.y, max(q.x * 0.866025 + p.y * 0.5, -p.y) - h.x * 0.5);
}

float sdRoundTriPrism(vec3 p, vec2 h, float r) {
    return max(sdTriPrism(p, h), -sdSphere(p - vec3(0.0, h.x * 0.5, -1.0), r));
}

float sdCappedTorus(vec3 p, vec2 sc, float ra, float rb) {
    p.x = abs(p.x);
    float k = (sc.y * p.x > sc.x * p.y) ? dot(p.xy, sc) : length(p.xy);
    return sqrt(dot(p, p) + ra * ra - 2.0 * ra * k) - rb;
}

float sdCatNose(vec3 p) {
    return sdSphere(p, 0.11);
}

float sdCatMouth(vec3 p) {
    vec3 pRot = rotate(p, PI, 0.0, 0.0);
    float left = sdCappedTorus(pRot + vec3(-0.09, 0.0, 1.0), vec2(0.1, 0.1), 0.15, 0.01);
    float right = sdCappedTorus(pRot + vec3(0.09, 0.0, 1.0), vec2(0.1, 0.1), 0.15, 0.01);
    return min(left, right);
}

SceneSample scene(vec3 p, vec3 dir) {
    vec3 rep = vec3(4.0, 10.0, 10.0);
    vec3 pRep = p - rep * round(p / rep);
    vec3 repId = round(p / rep);

    float headRadius = 1.0;
    float earSize = 0.3;
    float earOffset = 0.5;
    float eyeSize = 0.1;
    float eyeOffsetX = 0.3;
    float eyeOffsetY = 0.1;
    float mouthWidth = 0.2;
    float mouthHeight = 0.1;
    float mouthOffsetY = -0.3;
    SceneSample head = SceneSample(sdSphere(pRep, headRadius), 1, repId, vec4(0.0), true);

    SceneSample leftEar = SceneSample(sdConeBound(pRep + vec3(-earOffset, -headRadius + 0.0, 0.2), vec2(0.35, 0.1), 0.5), 2, repId, vec4(0.0), false);
    SceneSample rightEar = SceneSample(sdConeBound(pRep + vec3(earOffset, -headRadius + 0.0, 0.2), vec2(0.35, 0.1), 0.5), 2, repId, vec4(0.0), false);
    SceneSample ear = combine(leftEar, rightEar);

    SceneSample leftEye = SceneSample(sdSphere(pRep - vec3(eyeOffsetX, eyeOffsetY, -headRadius * 0.9), eyeSize), 3, repId, vec4(0.0), false);
    SceneSample rightEye = SceneSample(sdSphere(pRep - vec3(-eyeOffsetX, eyeOffsetY, -headRadius * 0.9), eyeSize), 3, repId, vec4(0.0), false);
    SceneSample eye = combine(leftEye, rightEye);

    SceneSample nose = SceneSample(sdCatNose(pRep - vec3(0.0, 0.0, -headRadius * 0.9)), 4, repId, vec4(0.0), false);

    SceneSample mouth = SceneSample(sdCatMouth(pRep), 5, repId, vec4(0.0), false);

    SceneSample combined = combine(mouth, combine(nose, combine(head, combine(eye, ear))));
    if (combined.closest_distance < 0.01) {
        combined.color = resolve_color(combined.index, p, repId, dir);
    }
    return combined;
    // return head;
}

float scene_f(vec3 p, vec3 dir) {
    return scene(p, dir).closest_distance;
}

vec3 normal(in vec3 p, vec3 dir) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps, 0);
    return normalize(vec3(scene_f(p + h.xyy, dir) - scene_f(p - h.xyy, dir),
            scene_f(p + h.yxy, dir) - scene_f(p - h.yxy, dir),
            scene_f(p + h.yyx, dir) - scene_f(p - h.yyx, dir)));
}
float fov_factor() {
    return tan(FOV / 2.0 * PI / 180.0);
}

vec4 joinColors(vec4 a, vec4 b) {
    float w = a.w + b.w;
    vec4 c = a * a.w + b * b.w;
    // vec4 c = a + b ;
    c.w = w;
    return c;
}

RayEnd follow_ray(vec3 start, vec3 direction, int steps, float max_dist) {
    float traveled = 0.0;
    vec4 joinedColor = vec4(0);
    for (int i = 0; i < steps; ++i) {
        vec3 p = start + direction * traveled;
        SceneSample s = scene(p, direction);
        if (s.closest_distance < 0.01) {
            s.color = joinColors(s.color, joinedColor);
            joinedColor = s.color;
            if (!s.cont || joinedColor.w > 0.99) {
                return RayEnd(s, p);
            }
        }
        if (traveled >= max_dist) {
            break;
        }
        if (s.closest_distance < 0.01) {
            traveled += 0.01;
        } else {
            traveled += s.closest_distance;
        }
    }
    joinedColor.w = 1.0;
    return RayEnd(SceneSample(traveled, -1, vec3(0.0), joinedColor, false), start + direction * traveled);
}

vec4 render(vec3 eye, vec3 ray) {
    RayEnd end = follow_ray(eye, ray, 90, 100.0);
    return end.s.color;
    // if (end.s.index == -1) {
    //     vec4 c = vec4(0);
    //     c.w = 1.0;
    //     return c;
    // }
    // vec4 color = resolve_color(end.s.index, end.current_position, end.s.rep, ray);
    // return color;
}

void main() {
    float fov = fov_factor();
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.08)) / (1.08);
    vec3 ray_direction = normalize(vec3(pixel_position, 1.0));

    out_color = render(vec3(-4.0, 0.0, -5.0), ray_direction);
    // out_color = vec4(ray_direction, 1.0);
    // out_color = vec4(sin(sdFbm(vec3(uv * 40.0, 0.0), 7.0)), 0.0, 0.0, 1.0);
}
